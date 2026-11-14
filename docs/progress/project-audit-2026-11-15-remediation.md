# 审计问题整改记录（FIREFLY-AUDIT-20261115-01）

> 整改对象：`docs/progress/project-audit-2026-11-15.md` 中 14 项发现（AUD-001 ~ AUD-014）。
> 本文件记录整改方声明的逐项修复方式、影响面与验证边界；不替代独立验收。`f14433b` 的 [独立验收报告](project-audit-2026-11-15-acceptance.md)结论为未通过，实际关闭状态以该报告的逐项结论为准。

## 1. 总体说明

- 本次整改以“直接收口到当前最佳实现”为原则：删除未验签分支、旧同步导出入口等失效路径，不保留双轨兼容。
- 涉及安全配置（JWT 密钥、内部服务令牌）时，生产环境默认留空并在缺失时拒绝启动，开发环境保留可用默认值。
- 涉及菜单/权限台账的变更已通过 Flyway 维护（`V41__add_telemetry_retention_permission.sql` 属于上一交付；本次未新增菜单）。

## 2. 逐项整改

### AUD-001 JWT 公钥缺失仍接受未验签身份

- `JwtService` 改为必须从 `auth.jwt.private-key` 加载 Base64(PKCS#8) RSA 私钥，缺失/损坏直接拒绝启动，不再随机生成密钥对。
- 网关 `AuthGlobalFilter.init()` 在公钥缺失或解析失败时抛异常，网关拒绝启动。
- 删除 `publicKey == null` 的未验签分支与 `parseJwtPayload`。
- 开发环境在 `application.yml` 提供默认 RSA 密钥对；`application-prod.yml` 默认留空，生产必须通过 `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` 注入。
- `deploy/.env.example`、`docker-compose.prod.yml`、`docker-compose.github.yml` 补齐密钥与内部令牌环境变量。

### AUD-002 客户端可伪造内部权限上下文

- 网关在 JWT、AppKey、白名单三条入口统一调用 `clearInternalHeaders`，清除 `X-User-Id`、`X-Tenant-Id`、`X-App-Key-Id`、`X-Granted-Permissions`、签名头与内部令牌，再由已验证身份重建可信头。
- AppKey 入口同样清除 JWT 相关内部头，两类身份不能由请求头相互切换。

### AUD-003 多数业务服务权限注解实际放行

- `SecurityAspect` 改为 fail-closed：无本地 `PermissionChecker` 时读取 system 写入 Redis 的 `perm:user:{userId}` 权限集合；两者都不可用或集合为空时直接拒绝。
- `PermissionService` 的 Redis 缓存保留期从 30 分钟提升到 12 小时，权限变更仍由 `PermissionEventConsumer` 主动删除。

### AUD-004 内部接口与服务端口缺少访问边界

- 网关对包含 `/api/v1/internal/` 的路径直接返回 404，公共入口不再可达内部接口。
- 新增 `InternalAuthProperties` + `InternalAccessInterceptor`：`/api/v1/internal/**` 必须携带 `X-Internal-Token`，令牌未配置或缺失即 401。
- Feign 拦截器无条件注入内部令牌；网关调用 system 内部 OpenAPI 授权接口时同样注入。
- `issue-token` 校验设备真实存在且租户/产品归属一致，令牌有效期限制为 1~86400 秒。
- `docker-compose.prod.yml` / `docker-compose.github.yml` 移除 system/device/rule/media/data/support 的宿主机端口映射（media 保留 5060/udp SIP），`deploy.sh` 移除依赖宿主端口的 Rule 健康检查。

### AUD-005 Token 撤销分支完成后仍进入业务转发

- `validateAndForwardJwt` 使用 `get(...).defaultIfEmpty("")` 收敛为单元素流，拒绝与转发在同一个 `flatMap` 内二选一，删除 `switchIfEmpty` 兜底转发。

### AUD-006 可配置规则表达式能调用 JVM 方法

- 规则过滤、告警条件、流转模板统一改为 `SimpleEvaluationContext.forPropertyAccessors(new MapAccessor())`，禁止类型引用、构造器、静态/实例方法调用。
- `message` 对象在上下文中改为 Map 暴露，避免反射能力泄漏。

### AUD-007 新提交缺少数据流转执行器源码

- `dataforward/target` 包更名为 `dataforward/executor`，源码纳入版本管理。
- `.gitignore` 改为 `/target/` + `/*/target/`，只忽略根目录与一级模块构建产物，不再吞掉 `src` 下名为 target 的业务包。

### AUD-008 流转连接缓存没有隔离租户和凭据

- MQTT/AMQP 缓存键加入 `tenantId` 与凭据 SHA-256 摘要；凭据轮换时关闭同端点旧连接。
- 并发创建落败连接、发布失败连接均显式关闭，避免连接泄漏。

### AUD-009 数据范围 SQL 的 IN 列表和逻辑分组生成错误

- IN 列表改用 `ParenthesedExpressionList`，生成 `IN (a, b)`。
- 原 WHERE 为 OR 组合时整体加括号；数据范围表达式整体加括号后再与原条件 AND。

### AUD-010 分组权限被扩大成整个项目权限

- `DatabaseDataScopeResolver` 的 GROUP 分支只收集组内设备 ID，不再把设备所属项目/产品加入可访问集合。

### AUD-011 数据范围只限制列表，详情和修改可按 ID 绕过

- `DeviceService.getActiveDevice` 统一追加 `assertDeviceInScope`：详情、修改、启停、删除、密钥读取均按 SELF/PROJECT/PRODUCT/DEVICE 范围校验，范围外返回 `PERMISSION_DENIED`。

### AUD-012 设备与物模型导入实际同步执行

- 新增 `ImportTaskDispatcher`，导入执行体提交到独立线程池；`DeviceImportService` / `ThingModelImportService` 通过分发器调用，注册接口立即返回 taskId。
- `TracingAsyncConfig` 去掉 `@ConditionalOnBean(Tracer.class)`，即使未启用追踪也注册 `taskExecutor`，避免异步退化为同步。
- 移除物模型导入上无效的 `@Transactional`（单条 JSONB 更新使用自动提交）。

### AUD-013 设备消息处理失败被吞掉

- `DeviceMessageConsumer` 反序列化与处理失败均抛出，交由监听容器重试。
- 路由层核心写入（遥测、事件、影子、在线状态）失败上抛；位置同步等派生能力保持 best-effort。
- 新增 `KafkaConsumerErrorConfig`：`DefaultErrorHandler` 重试 3 次后投递 `<topic>.dlt` 死信。
- `device_telemetry` 增加 `message_id` 与唯一索引 `(message_id, property, ts)`，批量写入改为 `ON CONFLICT DO NOTHING`，重试不重复写入。

### AUD-014 前端导入导出仍保留违规路径

- 设备三元组导出改为异步任务 `POST /devices/triples/export-task`：后端在独立线程生成 CSV（仅产品 Key、设备名称、别名、密钥等业务标识，不导出数据库主键）并上传 MinIO，前端仅提交任务并提示到任务中心下载。
- 物模型参数清单导入改为后端 `POST /products/{id}/thing-model/parse-parameters` 服务端解析，浏览器不再调用 `XLSX.read` 解析导入文件。

## 3. 验证边界

| 验证项 | 结果 |
| --- | --- |
| 后端 `mvn compile`（common/gateway/device/rule/system/support） | 通过 |
| 后端单元测试（firefly-device 全量 + firefly-rule 相关） | 通过（见提交记录） |
| 前端 `tsc && vite build` | 通过 |
| PostgreSQL / Kafka / 真实 Broker 端到端 | 未在本环境执行；AUD-009 的 SQL 字符串与 AUD-013 的 Kafka 错误处理需在联调环境回归 |
| 生产密钥/内部令牌注入 | 需在部署环境配置 `JWT_PRIVATE_KEY`、`JWT_PUBLIC_KEY`、`FIREFLY_INTERNAL_TOKEN` |

## 4. 部署与运维变更

- 生产必须提供 JWT 私钥/公钥与内部服务令牌，否则 `firefly-system` / `firefly-gateway` 拒绝启动、内部接口拒绝访问。
- 业务服务不再暴露宿主机端口；外部仅通过网关、前端、Connector 与必要的媒体端口访问。
- Kafka 需允许自动创建 `<topic>.dlt`，或由运维预建死信 topic。
- 新增数据库迁移 `V28__add_telemetry_message_id.sql`，随 `firefly-device` 启动执行。
