# OpenAPI / 租户订阅 / AppKey 管理设计

## 1. 背景

平台需要把对外开放接口从“单纯发放 API Key”升级为“平台统一编目、租户按接口订阅、租户内 AppKey 再次细分授权”的三层模型，满足以下目标：

- 研发在微服务 Controller 方法上标注 `@OpenApi` 后，系统自动汇总当前所有可开放的 OpenAPI。
- 平台租户管理页面可以明确某个租户订阅了哪些 OpenAPI，并给每个 OpenAPI 配置调用限制。
- 租户空间可以维护 AppKey，并限制每个 AppKey 只能调用已订阅 OpenAPI 的子集。
- 网关必须在真正转发前完成 AppKey 签名验签、租户订阅校验和限流，避免后端服务重复实现一套鉴权。

根据仓库规则，本次实现直接收口到新模型，不再保留旧的“平台 API Key 管理页 / 旧权限点 / 旧菜单入口”双轨逻辑。

## 2. 目标与范围

### 2.1 目标

- 建立 OpenAPI 目录表，使用业务唯一键 `code` 标识接口。
- 建立租户 OpenAPI 订阅表，支持 IP 白名单、并发限制、日调用限制。
- 复用现有 `api_keys` 作为租户空间 AppKey 存储，并将授权范围收口为 OpenAPI 编码列表。
- 新增 `@OpenApi` 注解和自动注册机制，所有被标注的接口按服务启动自动同步到 `open_api_catalog`。
- 网关支持 `X-App-Key + X-Timestamp + X-Nonce + X-Signature` 固定签名认证，并透传租户、AppKey、OpenAPI、权限上下文。
- 提供系统运维空间、平台租户管理、租户空间三处前端管理能力。

### 2.2 非目标

- 本次不新增单独的 AppKey-OpenAPI 绑定表，继续复用 `api_keys.scopes` JSONB。
- 本次不保留旧 `/api-keys` 管理入口和旧 `apikey:*` 平台菜单。
- 本次不保留 `X-App-Secret` 明文传输方案，也不做多算法兼容，只采用固定的 `HMAC-SHA256` 签名方案。
- 本次不再保留 OpenAPI 目录的页面手工创建、编辑、删除逻辑，目录源头直接收口为代码标注。

## 3. 核心模型

### 3.1 OpenAPI 目录

表：`open_api_catalog`

关键字段：

- `code`：OpenAPI 业务编码，系统内唯一。
- `service_code`：网关服务短码，如 `SYSTEM`、`DEVICE`。
- `http_method`：HTTP 方法。
- `path_pattern`：下游服务路径模板，统一以 `/api/v1/...` 口径维护。
- `permission_code`：命中接口后向下游透传的权限码。
- `enabled`：是否允许订阅和对外开放。

注册来源：

- 各微服务在 Controller 方法上标注 `@OpenApi(code = "...")`。
- 服务启动后由后台定时任务通过内部同步接口将注解元数据写入 `open_api_catalog`，首次同步默认延迟 10 秒，不阻塞业务服务启动。
- 同一 `service_code` 下已不存在于本次同步结果中的目录项会被自动删除，避免手工目录与代码脱节。

### 3.2 租户订阅

表：`tenant_open_api_subscriptions`

关键字段：

- `tenant_id`
- `open_api_code`
- `ip_whitelist`：JSONB 数组。
- `concurrency_limit`：单租户对单 OpenAPI 的并发限制，`-1` 表示不限。
- `daily_limit`：单租户对单 OpenAPI 的单日总量限制，`-1` 表示不限。

### 3.3 AppKey

复用表：`api_keys`

调整点：

- 业务语义从旧 `API Key` 收口为租户空间的 `AppKey`。
- `scopes` 字段不再表示通用权限范围，而是存储 `openApiCodes` JSON 数组。
- `secret_key_hash` 保留为 Secret Key 指纹，`secret_key_ciphertext` 新增为服务端可解密密文，仅用于验签。
- 前端和接口统一改为 `/api/v1/app-keys`。

## 4. 鉴权与转发链路

### 4.1 管理面链路

1. 各微服务启动后扫描自身 `@OpenApi` 标注的方法并同步到 `open_api_catalog`。
2. 平台管理员在租户管理页为指定租户配置订阅项和限制。
3. 租户空间在 AppKey 页面创建或编辑 AppKey，选择当前租户已订阅的 OpenAPI 子集。

### 4.2 运行时链路

1. 调用方通过网关访问 `/open/{SERVICE}/api/v1/...`。
2. 调用方本地按固定规范计算签名，请求头携带 `X-App-Key`、`X-Timestamp`、`X-Nonce`、`X-Signature`，不会传输 Secret Key 本身。
3. 网关只对 `/open/**` 路径启用 AppKey 鉴权，缓存原始请求体后按访问路径反解 `serviceCode + requestPath + httpMethod`，并生成规范化 query/body 摘要。
4. 网关调用系统服务内部接口 `/api/v1/internal/open-apis/authorize` 做统一鉴权。
5. 系统服务依次校验：
   - AppKey 是否存在、未删除、未停用、未过期。
   - 时间戳是否在允许窗口内，随机串是否满足格式要求。
   - 用服务端解密 Secret Key 按相同 Canonical Request 计算 HMAC-SHA256，并校验签名。
   - 请求路径是否命中已启用 OpenAPI。
   - AppKey 是否被授予该 OpenAPI。
   - 租户是否订阅该 OpenAPI。
   - 请求 IP 是否在订阅白名单内。
6. 网关在 Redis 上执行防重放、并发与配额控制：
   - `appKeyId + nonce` 防重放
   - 单 OpenAPI 并发限制
   - AppKey 每分钟限制
   - AppKey 每日限制
   - 租户订阅每日限制
7. 网关向下游透传上下文：
   - `X-Tenant-Id`
   - `X-Platform=open-api`
   - `X-App-Key-Id`
   - `X-Open-Api-Code`
   - `X-Granted-Permissions`
8. 下游服务通过 `firefly-common` 的上下文解析和安全切面识别 AppKey 调用。

### 4.3 Canonical Request

签名输入统一为以下七行文本，字段之间使用换行符 `\n` 连接：

1. `HTTP_METHOD`，统一转大写
2. `SERVICE_CODE`，统一转大写
3. `REQUEST_PATH`
4. `CANONICAL_QUERY`
5. `BODY_SHA256`
6. `TIMESTAMP`
7. `NONCE`

其中：

- `CANONICAL_QUERY` 按 query key/value 排序，并以 RFC3986 编码后拼接。
- `BODY_SHA256` 为原始请求体字节数组的 SHA256 十六进制摘要；空 body 也必须参与计算。
- 最终签名算法固定为 `HMAC-SHA256(secretKey, canonicalRequest)`，输出 64 位小写十六进制字符串。

### 4.4 自动注册链路

1. 微服务启动完成后，由后台定时任务延迟扫描 Spring MVC `RequestMappingHandlerMapping`。
   - 仅扫描业务 Controller 所在的 `requestMappingHandlerMapping`，不扫描 Actuator 的 `controllerEndpointHandlerMapping`，避免运维端点映射干扰 OpenAPI 自动注册。
2. 找到所有被 `@OpenApi` 标注的方法，自动解析：
   - `code`
   - `serviceCode`
   - `httpMethod`
   - `pathPattern`
   - `permissionCode`
   - `enabled`
   - `sortOrder`
   - `description`
3. 服务通过内部接口 `POST /api/v1/internal/open-apis/sync` 向系统服务全量同步本服务目录。
   - 若 `firefly-system` 暂未就绪，则记录失败日志并等待下一次定时重试，不影响当前业务服务继续启动和对内提供能力。
4. 系统服务按 `serviceCode` 对当前目录做幂等 upsert，并删除当前服务已下线的旧目录项。

约束：

- `@OpenApi` 必须落在具备且仅具备一个 HTTP Method 的 Controller 方法上。
- 若注解未显式填写 `permissionCode`，则方法上必须存在单权限值的 `@RequiresPermission` 以便自动回填透传权限。
- 页面展示的外部访问路径固定为 `/open/{SERVICE}{pathPattern}`。

## 5. 权限与菜单模型

本次新增并收口以下权限：

- 平台：`openapi:read`
- 租户：`appkey:read/create/update/delete`

本次同步通过 Flyway 维护：

- `workspace_menu_catalog`
- `workspace_menu_permission_catalog`
- `permission_resources`
- `role_permissions`

其中：

- `V30__backfill_open_api_menu_catalog.sql` 用于修复历史环境遗漏的系统菜单管理基础数据，回填 `open-api`、`app-key` 对应的 `workspace_menu_catalog`、`workspace_menu_permission_catalog` 与权限资源，确保系统菜单管理可以为系统运维空间和租户空间分配权限。

菜单归属：

- 系统运维空间：`open-api`
- 租户空间：`app-key`

旧 `api-key` 菜单、旧 `apikey:*` 平台菜单权限全部删除，不保留兼容入口。

## 6. 前后端接口

### 6.1 系统运维空间

- `POST /api/v1/platform/open-apis/list`
- `GET /api/v1/platform/open-apis/{code}`
- `GET /api/v1/platform/open-apis/options`

### 6.2 平台租户管理

- `GET /api/v1/platform/tenants/{id}/open-api-subscriptions`
- `PUT /api/v1/platform/tenants/{id}/open-api-subscriptions`

### 6.3 租户空间

- `POST /api/v1/app-keys/list`
- `GET /api/v1/app-keys/{id}`
- `POST /api/v1/app-keys`
- `PUT /api/v1/app-keys/{id}`
- `PUT /api/v1/app-keys/{id}/status`
- `DELETE /api/v1/app-keys/{id}`
- `GET /api/v1/app-keys/open-api-options`

### 6.4 网关内部接口

- `POST /api/v1/internal/open-apis/authorize`
- `POST /api/v1/internal/open-apis/sync`

## 7. 前端交互设计

- 系统运维空间新增 `OpenAPI 管理` 页面。
  - 列表支持关键字、服务、状态查询。
  - 页面改为只读目录，直接展示 `@OpenApi` 自动注册结果。
  - 页面显式提示“变更目录请改代码并重新部署”，不再保留手工录入抽屉。
- 平台租户管理在更多操作中新增 `OpenAPI订阅` 抽屉。
  - 逐条配置订阅开关、IP 白名单、并发上限、日调用上限。
- 租户空间将旧 API Key 页替换为 `AppKey 管理`。
  - 查询按钮支持列表刷新。
  - 创建、编辑使用抽屉。
  - 只允许从已订阅 OpenAPI 中多选。
  - 创建成功后仅一次展示 Secret Key，并明确提示“只用于本地签名，不可明文传输”。

## 8. 关键设计取舍

### 8.1 为什么复用 `api_keys`

- 数据结构已经具备租户、密钥、限流、过期时间等核心字段。
- 只需调整语义和授权范围即可承载 AppKey，不必引入额外迁移复杂度。

### 8.2 为什么不单独建 AppKey-OpenAPI 关系表

- 当前授权模型是“每个 AppKey 对若干 OpenAPI 编码的静态列表”。
- 继续使用 JSONB 可以减少表数量和管理复杂度。
- 若后续出现单 AppKey 级别更细粒度限额，再评估拆表。

### 8.3 为什么把鉴权放在网关

- 可以在最前置位置统一拒绝未授权请求。
- 可以集中做 Redis 并发与配额控制。
- 下游业务服务只消费统一上下文，不再感知 AppKey 校验细节。

### 8.4 为什么服务端仍需保存可解密 Secret Key

- HMAC 验签必须重新得到原始 Secret Key，单向哈希无法直接完成验签。
- 因此服务端保留 `secret_key_hash + secret_key_ciphertext` 双字段：前者用于指纹校验，后者用于 AES-GCM 解密后参与验签。
- 出于安全收口考虑，Secret Key 只在创建成功时返回给租户一次，之后不再回显。

### 8.5 为什么改为注解自动注册

- OpenAPI 是否对外开放本质上属于代码行为，手工维护目录很容易与真实接口脱节。
- 用 `@OpenApi` 标注后，路径、HTTP 方法、透传权限和目录项来自同一份源码，能直接避免页面配置和后端实现不一致。
- 系统运维空间仍保留目录查看能力，但不再承担“手工录入真实接口”的职责。

## 9. 风险与后续项

- 目前 AppKey 调用日志查询接口仍沿用既有能力，若要形成完整审计闭环，需要确保网关侧访问日志事件持续投递。
- Redis 配额键依赖网关时间窗口，跨时区部署时应统一服务时区。
- `V28` 之前创建的历史 AppKey 没有 `secret_key_ciphertext`，升级后必须重新创建，不能继续沿用旧凭证。
- 历史手工录入的 OpenAPI 目录会在对应服务下一次自动同步时被覆盖或删除；如存在试运行数据，应提前清理对应订阅和 AppKey 授权。
- 若历史数据库中有手工补录的旧 `api-key` 菜单或权限脏数据，应按新模型清理，避免继续展示旧入口。
- 若历史环境在较早版本执行过 OpenAPI 相关 Flyway，而未带上菜单目录种子数据，必须确认 `V30` 已执行，否则系统菜单管理中不会出现 `OpenAPI 管理` / `AppKey 管理`。
