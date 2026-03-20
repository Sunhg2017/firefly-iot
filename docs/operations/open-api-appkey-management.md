# OpenAPI / AppKey 管理运维说明

## 1. 适用范围

本文用于 OpenAPI 目录、租户订阅、租户 AppKey 能力的部署、升级、检查、排障与回滚。

涉及模块：

- `firefly-system`
- `firefly-gateway`
- `firefly-common`
- `firefly-web`

## 2. 上线内容

### 2.1 数据库变更

Flyway 脚本：

- `firefly-system/src/main/resources/db/migration/V27__init_open_api_management.sql`
- `firefly-system/src/main/resources/db/migration/V28__harden_appkey_signature_auth.sql`
- `firefly-system/src/main/resources/db/migration/V29__open_api_registry_readonly.sql`

主要动作：

- 新建 `open_api_catalog`
- 新建 `tenant_open_api_subscriptions`
- 为 `api_access_logs` 增加 `open_api_code`
- 为 `api_keys` 增加 `secret_key_ciphertext`
- 删除 OpenAPI 页面手工增删改权限，仅保留目录查看
- 删除旧 `api-key` 菜单、权限和台账
- 新增 `open-api`、`app-key` 菜单与权限台账

### 2.2 应用变更

- 网关增加 AppKey 鉴权与 Redis 配额控制逻辑
- AppKey 鉴权从 `X-App-Secret` 明文传输切换为 `timestamp + nonce + HMAC-SHA256` 验签
- 各微服务增加 `@OpenApi` 自动扫描与上报能力
- 系统服务增加 OpenAPI 自动同步接口与只读目录管理接口
- 前端增加 OpenAPI 只读目录页、租户订阅抽屉、AppKey 页面

## 3. 部署顺序

推荐顺序：

1. 备份数据库。
2. 发布 `firefly-system`，完成 Flyway 执行。
3. 发布 `firefly-gateway`。
4. 发布 `firefly-web`。
5. 按服务逐个验证 `@OpenApi` 自动同步是否完成。
6. 验证系统运维空间、平台租户管理、租户空间三处入口是否正常。

原因：

- 先升级系统服务，确保内部鉴权接口和新表结构就绪。
- 再升级各业务微服务，确保它们能在启动后把 `@OpenApi` 目录同步到系统服务。
- 然后升级网关，避免外部 `/open/**` 路由调用到缺失的鉴权逻辑。
- 最后升级前端，避免页面先出现而后端接口未就绪。

## 4. 依赖项

### 4.1 基础依赖

- PostgreSQL
- Redis
- Nacos 注册发现

### 4.2 配置关注点

- 网关必须可通过服务发现访问 `firefly-system`
- 各业务微服务必须可通过服务发现访问 `firefly-system`，用于自动同步 `@OpenApi` 目录
- 网关 Redis 必须可写，否则并发与配额控制失效
- JWT 公钥配置仍用于用户态请求；AppKey 请求不依赖 JWT
- `firefly-system` 生产环境必须配置 `FIREFLY_OPENAPI_APPKEY_SECRET_ENCRYPT_KEY`
- `firefly-system` 与 `firefly-gateway` 的 `FIREFLY_OPENAPI_APPKEY_SIGNATURE_WINDOW_SECONDS` 应保持一致

## 5. 升级后检查项

### 5.1 数据检查

确认以下对象存在：

- `open_api_catalog`
- `tenant_open_api_subscriptions`
- `api_access_logs.open_api_code`
- `api_keys.secret_key_ciphertext`

确认以下台账已更新：

- `workspace_menu_catalog` 中存在 `open-api`、`app-key`
- `workspace_menu_permission_catalog` 中 `open-api` 仅保留 `openapi:read`
- `permission_resources` 中保留 `openapi:read` 和 `appkey:*` 明细

确认以下旧数据已删除：

- `workspace_menu_catalog.menu_key = 'api-key'`
- `workspace_menu_permission_catalog.menu_key = 'api-key'`
- 旧 `apikey:*` 平台菜单权限资源

### 5.2 页面检查

- 系统运维空间出现 `OpenAPI 管理`
- 平台租户管理更多操作中出现 `OpenAPI订阅`
- 租户空间出现 `AppKey 管理`

### 5.3 接口检查

推荐至少验证以下流程：

1. 在代码中为目标 Controller 方法添加 `@OpenApi` 标注。
2. 重启或发布对应业务微服务，确认该接口已自动同步到 `open_api_catalog`。
3. 在租户管理中为目标租户订阅该 OpenAPI。
4. 进入租户空间创建 AppKey，并选择该 OpenAPI。
5. 使用 `X-App-Key`、`X-Timestamp`、`X-Nonce`、`X-Signature` 调用 `/open/{SERVICE}/api/v1/...` 路径。
6. 验证未订阅、未授权、超限、IP 不在白名单、时间戳过期、重复 nonce 时返回拒绝。

当前可直接联调的首个示例：

- `GET /open/DEVICE/api/v1/products/thing-model/by-product-key?productKey=...`

## 6. 运行排障

### 6.1 页面没有出现新菜单

排查顺序：

1. 确认 Flyway `V27` 已执行。
2. 确认 Flyway `V28` 已执行。
3. 确认 Flyway `V29` 已执行。
4. 确认当前角色已分配新权限。
5. 确认租户空间授权未把 `app-key` 菜单取消。
6. 确认浏览器重新登录后菜单缓存已刷新。

### 6.2 OpenAPI 目录没有自动出现

重点检查：

- 目标接口是否确实标注了 `@OpenApi`
- 标注方法是否只有一个 HTTP Method 和一个有效路径
- `permissionCode` 是否显式填写，或该方法是否具备单值 `@RequiresPermission`
- 对应业务微服务是否启动成功并注册到 Nacos
- 业务微服务日志中是否出现 `OpenAPI registration sync failed`
- `firefly-system` 是否可被业务微服务通过服务名访问

### 6.3 网关调用返回 401/403

重点检查：

- `X-App-Key`、`X-Timestamp`、`X-Nonce`、`X-Signature` 是否齐全且正确
- 调用方本地签名串是否与网关验签规则一致
- 请求路径是否走 `/open/{SERVICE}/api/...` 外部入口
- AppKey 状态是否为 `ACTIVE`
- AppKey 是否过期
- 访问路径是否命中已启用 OpenAPI
- AppKey 是否勾选该 OpenAPI
- 租户是否订阅该 OpenAPI
- 请求 IP 是否在订阅白名单内
- `firefly-system` 的 `FIREFLY_OPENAPI_APPKEY_SECRET_ENCRYPT_KEY` 是否正确

### 6.4 网关调用返回 429

重点检查：

- AppKey 每分钟上限
- AppKey 每日上限
- 租户订阅每日上限
- 租户订阅并发上限
- Redis 是否存在历史残留计数键

常用 Redis 键前缀：

- `openapi:nonce:`
- `openapi:concurrent:`
- `openapi:quota:appkey:minute:`
- `openapi:quota:appkey:day:`
- `openapi:quota:tenant:day:`

### 6.5 网关调用返回 503

重点检查：

- `firefly-system` 是否正常注册到 Nacos
- 网关到系统服务的服务发现是否正常
- `@LoadBalanced WebClient.Builder` 是否已随新版本发布

### 6.6 AppKey 页面无法创建

重点检查：

- 当前租户是否已订阅至少一个已启用 OpenAPI
- `GET /api/v1/app-keys/open-api-options` 返回是否为空

## 7. 日志定位

### 7.1 网关

关注日志关键字：

- `OpenAPI appKey authorization failed`
- `app key signature`
- JWT / AppKey 鉴权相关 warning 或 error

### 7.2 系统服务

关注日志关键字：

- `AppKey deleted`
- `OpenAPI registration sync`
- OpenAPI / tenant subscription 相关 BizException

## 8. 回滚策略

### 8.1 应用回滚

- 先回滚前端
- 再回滚网关
- 最后回滚系统服务

### 8.2 数据回滚

不建议直接回滚 Flyway 历史版本。

建议方式：

- 保留新表结构
- 停止使用新菜单和新接口
- 人工清理试运行期间产生的 OpenAPI、订阅、AppKey 数据

若必须彻底回退到旧模型，应额外制定数据库清理脚本，并确认不会重新引入旧 `api-key` 菜单和权限的双轨逻辑。

## 9. 运维建议

- 生产环境先在代码中完成 `@OpenApi` 标注并部署各业务微服务，再由系统运维空间核对自动注册结果。
- 对外暴露前，先为每条 OpenAPI 配置明确的透传权限码，避免下游只做租户隔离而未做动作级控制。
- 升级到签名方案后，历史 AppKey 必须重新创建；不要试图恢复 `X-App-Secret` 直传兼容逻辑。
- 生产环境不要使用开发默认密钥，`FIREFLY_OPENAPI_APPKEY_SECRET_ENCRYPT_KEY` 必须独立生成并妥善保管。
- 若存在历史手工录入的 OpenAPI 目录或旧 API Key 相关脏数据，按新模型统一清理，不要在代码里恢复旧入口。
