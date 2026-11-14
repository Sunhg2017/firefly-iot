# 审计验收未通过项（ACC-001～ACC-006）整改记录

> **基线**: `project-audit-2026-11-15-acceptance.md`（验收结论：未通过，6 项残留/回归）
> **整改提交**: 见仓库 `master` 对应提交
> **范围**: 仅整改验收报告确认的 6 项，不改变已验证通过项的语义。

---

## 1. 整改结论

| 编号 | 结论 | 修复方式 | 回归测试 |
| --- | --- | --- | --- |
| ACC-001 | 已修复 | 统一 `DataScopeContext.allowsDevice(projectId, deviceId)`，设备授权只认项目归属与设备集合，产品维度不再参与设备授权 | `DeviceServiceTest` 同产品异项目负例 + 授权正例 |
| ACC-002 | 已修复 | 生产者发送方法返回 `CompletableFuture`，规则转发等待发送结果并在失败时上抛，触发重试/死信 | `MessageRouterServiceTest` 失败 future 传播 |
| ACC-003 | 已修复 | 新增迁移 `V31`，去重唯一键加入 `tenant_id`、`device_id` | 迁移与索引定义（见第 2 节） |
| ACC-004 | 已修复 | L1 命中写穿 L2；权限事件重建缓存；网关在 Redis 缺失时调用 system 内部接口重建 | `PermissionServiceTest` 写穿、重建、空集合 |
| ACC-005 | 已修复 | 导入线程每次进度上报检查任务是否已取消/结束，取消后不再下载、解析或写下一批 | `DeviceImportServiceTest`、`ThingModelImportServiceTest` 取消用例 |
| ACC-006 | 已修复 | 参数清单解析改为异步任务：注册返回 taskId、后台解析、Redis 存结果、进度/失败可查 | `ThingModelImportServiceTest` 注册、取消、结果读取 |

---

## 2. 逐项说明

### ACC-001 PROJECT 范围跨项目读取设备密钥

- **根因**：`assertDeviceInScope` 用 `projectIds OR productIds OR deviceIds` 判断；解析器把"授权项目下设备所属产品"也放进 `productIds`，产品关系因此变成对同产品其他项目设备的授权。
- **修复**：
  - `DataScopeContext` 新增 `allowsDevice(projectId, deviceId)`：`ALL` 放行；`SELF` 交由调用方按创建人判断；其余仅匹配 `projectIds` 或 `deviceIds`。
  - `DeviceService.assertDeviceInScope` 改用该谓词；列表 SQL 仍使用 `productColumn=""`，与单对象校验一致。
  - `DatabaseDataScopeResolver` 增加注释，明确 `productIds` 仅供产品域数据范围使用。
- **验证**：用户仅授权项目 100、产品 200（设备 10 在项目 100，设备 11 在项目 101）时，读取设备 11 密钥抛出 `PERMISSION_DENIED`，读取设备 10 正常。

### ACC-002 规则引擎发送失败无法触发消费失败

- **根因**：`DeviceMessageProducer.send` 使用 `whenComplete` 只记录失败；`forwardToRuleEngine` 捕获异常后只记录日志，消费者因此正常返回。
- **修复**：
  - `publishUpstream/publishToTopic/publishDownstream` 返回 `CompletableFuture<SendResult>`；序列化失败直接抛出。
  - `forwardToRuleEngine` 以 `firefly.kafka.rule-forward-timeout-ms`（默认 5000ms）等待发送结果，异常 future 转换为 `IllegalStateException` 上抛，由统一 ErrorHandler 重试/死信。
- **验证**：模拟 `publishToTopic` 返回失败 future 时，`routeUpstream` 抛出异常；正常 future 时仍完成转发。

### ACC-003 遥测去重键未包含设备身份

- **根因**：`uk_telemetry_message` 仅 `(message_id, property, ts)`，不同设备相同局部消息 ID 会冲突并被 `ON CONFLICT DO NOTHING` 丢弃。
- **修复**：新增 `V31__fix_telemetry_dedup_key.sql`，删除旧索引并以 `(tenant_id, device_id, message_id, property, ts)` 重建；`ON CONFLICT DO NOTHING` 语义不变。
- **边界**：`message_id` 为空的手工写入不参与去重；同一设备同一消息重试仍只保留一条。

### ACC-004 权限缓存失效后合法用户被拒绝

- **根因**：system L1 命中提前返回，不保证 Redis 存在；权限事件只删除 Redis 不重建；业务服务无本地 checker 时直接读 Redis，缺失即拒绝。
- **修复**：
  - `PermissionService.getUserPermissions`：L1 命中时若 Redis 集合缺失，用 L1 内容回填 L2。
  - 新增 `refreshUserPermissions(userId)`：清 L1、重算数据库权限、回写 L2；`PermissionEventConsumer` 对受影响用户调用该方法，角色删除且无用户列表时清空 L1。
  - 新增内部接口 `GET /api/v1/internal/permissions/users/{userId}`；网关在 JWT 请求转发前检查 `perm:user:{id}`，缺失时调用该接口触发重建（失败不阻断，业务侧仍 fail-closed）。
  - `RolePermissionMapper.findPermissionsByUserId` 忽略租户拦截，保证内部重建路径无租户上下文时也可查询。
- **验证**：L1 命中 + Redis 缺失时回填；`refreshUserPermissions` 删除并重建；空权限不写 Redis 且仍拒绝。

### ACC-005 导入线程忽略任务取消/结束

- **修复**：设备导入与物模型导入的每次进度上报改为 `ensureTaskActive`；任务中心返回 `false` 时抛出 `AsyncTaskCancelledException`，外层捕获后只停止线程，不再调用 `failTask` 改写终态。批次开始前额外检查一次，避免取消后继续写下一批。
- **验证**：`updateProgress` 返回 false 时，`fileClient` 不被调用，`completeTask/failTask` 不被调用。

### ACC-006 参数清单导入同步处理

- **修复**：
  - `POST /products/{id}/thing-model/parse-parameters` 改为注册异步任务并返回 taskId。
  - 后台线程下载解析，结果写入 Redis `thingmodel:parse:{taskId}`（1 小时），任务中心记录进度、行数、失败原因。
  - 新增 `GET /products/{id}/thing-model/parse-parameters/{taskId}` 读取结果。
  - 前端改为"注册任务 → 轮询进度 → 按 taskId 取结果"，不再同步等待。
- **验证**：注册返回 taskId 并提交执行器；取消后不下载；Redis 结果可读取。

---

## 3. 验证记录

| 验证项 | 结果 |
| --- | --- |
| 后端全量编译（common/device/system/gateway/rule/connector 等） | 通过 |
| `firefly-device` 单测 | 79 例通过 |
| `firefly-system` 单测 | 20 例通过（含 `PermissionServiceTest` 3 例） |
| 前端 `npm run build` | 通过 |

未在本环境连接 PostgreSQL/TimescaleDB、Kafka、Redis、MinIO 执行端到端验证；`V31` 索引变更需在目标库执行 Flyway 后确认，建议在联调环境验证"同设备重试只存一次 / 不同设备相同消息 ID 均保存"。

---

## 4. 后续

- ACC-002 重试会重复执行已成功的持久化副作用，遥测依赖去重键幂等，事件/影子写入的重复副作用需后续评估。
- ACC-004 多实例 L1 仍有最长 5 分钟陈旧窗口，事件重建覆盖 L2；如需秒级一致需引入缓存版本号或消息广播。
- ACC-006 解析结果仅保留 1 小时，超时需重新发起解析。
