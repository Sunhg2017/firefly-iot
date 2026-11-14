# 共享数据与连接器能力补齐设计说明

> 模块: `firefly-rule`、`firefly-device`、`firefly-connector`、`firefly-system`、`firefly-web`
> 日期: 2026-11-15
> 状态: Done
> 关联: [跨租户共享加固](cross-tenant-sharing-hardening.md)、[连接器管理](connector-management-auth-kafka-reliability.md)、[设备管理](detailed-design-device-management.md)

## 1. 背景

上一轮前端交互整改后，仍有四个能力缺口需要前后端一起收口，否则页面只能“禁用、规避或降级展示”：

1. SNMPv3 在 DTO 中已有字段，但 `SnmpService` 始终构造 `CommunityTarget`，未注册 USM 用户，选择 v3 必然失败，前端只能禁用。
2. 设备三元组导出 DTO 只有 `keyword/productId/status/onlineStatus`，按分组筛选后导出的范围与列表不一致，存在超范围导出设备密钥的风险。
3. 共享策略的 `events` 权限、`rateLimit`、`validity` 只做 JSON 合法性校验，没有执行语义：事件读取无入口，限流与有效期不生效。
4. 审计日志用户名依赖 `X-User-Name` 请求头，内部调用/直连时为空；Modbus 采集状态只有布尔值，看不到最近采集时间与错误。

## 2. 目标

- SNMPv3 支持 `noAuthNoPriv / authNoPriv / authPriv`，认证协议覆盖 MD5/SHA/SHA-2 系列，加密覆盖 DES/AES/3DES。
- 设备三元组导出与设备列表筛选同口径，`groupId`、`excludeVideo` 真正生效。
- 共享策略的 `events` 权限、频率限制、有效期在服务端强制执行，并提供共享事件读取接口（含脱敏与审计）。
- 审计日志在请求头缺失时回退登录上下文；Modbus 采集任务返回最近成功采集时间、最近尝试时间、最近错误与连续失败次数。
- 前端展示与后端能力一致：移除“未开放/需先勾选”的降级文案，补齐 v3 表单、导出范围、共享策略生效信息、Modbus 采集状态列。

## 3. SNMPv3 设计

### 3.1 目标构建

`SnmpService.buildTarget` 返回 `Target<Address>`：

- v1/v2c：沿用 `CommunityTarget`。
- v3：构造 `UserTarget<Address>`，设置：
  - `securityName`（必填）；
  - `securityLevel`（可选，缺省按口令推断：无认证口令 → `NOAUTH_NOPRIV`，有认证无加密 → `AUTH_NOPRIV`，两者都有 → `AUTH_PRIV`）；
  - `authProtocol`（MD5/SHA/SHA224/SHA256/SHA384/SHA512，缺省 SHA-1）；
  - `privProtocol`（DES/AES128/AES192/AES256/3DES，缺省 AES-128）。

同时通过 `snmp.getUSM().addUser(...)` 注册 `UsmUser`。SNMP4J 在首次请求时自动完成 engineID 发现，无需预设对端 engineID。

### 3.2 校验

- v3 必须提供 `securityName`。
- `authPassphrase` / `privPassphrase` 至少 8 位（USM 规范要求）。
- 显式 `securityLevel=AUTH_NOPRIV` 但无认证口令、或 `AUTH_PRIV` 但无加密口令时返回参数错误，而不是让 SNMP 侧超时。
- 协议名非法时返回明确错误，而不是静默回退到明文。

### 3.3 前端

SNMP 调试与采集抽屉在版本选择 v3 时展示安全名称、安全级别、认证/加密协议与口令；v2c 仍展示 Community。提交时统一构造目标对象，空口令不写入，避免把空字符串传给 USM。

## 4. 设备三元组导出范围

- `DeviceTripleExportDTO` 新增 `groupId`、`excludeVideo`。
- `buildExportWrapper` 与 `buildListWrapper` 使用同一组筛选条件：
  - 关键字、产品、分组、状态、在线状态、排除视频设备；
  - 分组筛选通过 `deviceGroupService.listDeviceIdsByGroup` 取成员，空成员返回空结果；
  - 视频设备通过 `device_video_profiles` 排除。
- 显式传入 `deviceIds` 时以设备 ID 为准，忽略筛选条件（精确导出语义）。
- 异步任务仍保存 DTO 并在执行时按同一 DTO 查询，保证“提交时范围”和“执行时范围”一致。
- 前端移除“按分组筛选必须先勾选设备”的临时限制，直接提交当前筛选。

风险：导出文件包含 `deviceSecret`，属于敏感凭据。导出权限仍由 `device:export` 控制，操作会进入审计；后续如需限制导出字段，应在导出 DTO 增加字段白名单，而不是在前端隐藏。

## 5. 共享策略执行语义

### 5.1 数据权限

`dataPermissions` 支持：

```json
{
  "properties": true,
  "telemetry": true,
  "events": true,
  "telemetryHistory": { "enabled": true, "maxDays": 7 }
}
```

- `properties`：允许读取最新属性快照。
- `telemetry`：允许读取历史遥测；`telemetryHistory.maxDays` 继续限制可回溯窗口。
- `events`：允许读取共享设备事件。

### 5.2 有效期

`validity` 支持 `{"startTime":"...","endTime":"..."}`：

- 两侧都可为空；为空表示该侧不限制。
- 判断使用服务端本地时间，区间为闭区间。
- 所有按 `policyId` 读取共享数据的入口（设备列表、最新属性、历史遥测、事件）都会校验；未生效或已过期返回 `14002`。
- 消费方“共享给我的策略”列表会跳过失效策略并记录告警日志，不阻断其他有效策略。

### 5.3 频率限制

`rateLimit` 支持 `{"qps":10,"dailyLimit":10000}`，使用 Redis 原子自增：

- QPS：`firefly:share:rate:{policyId}:qps:{epochSecond}`，TTL 2 秒。
- 日限：`firefly:share:rate:{policyId}:daily:{yyyyMMdd}`，TTL 2 天。
- 超限返回 `14001`，错误信息包含具体上限。
- 仅对按 `policyId` 的读取生效（列表、最新属性、历史遥测、事件）；“列出全部共享策略”不按单策略计数。
- Redis 不可用时 **fail-open** 并记录 WARN：共享数据面优先保证可用，限流失效由监控告警兜底。若后续要求严格限流，可改为 fail-closed 并增加本地令牌桶降级。

### 5.4 共享事件接口

新增链路：

```
GET /api/v1/shared/devices/{deviceId}/events?policyId=&startTime=&endTime=&limit=
  -> SharedDeviceService（策略/权限/有效期/限流校验、脱敏、审计）
  -> DeviceDataClient.querySharedEvents
  -> GET /api/v1/internal/device-data/shared/{deviceId}/events
  -> SharedDeviceReadService（ownerTenant + 设备归属校验）
  -> DeviceEventMapper.selectSharedEvents（mapper.xml，跳过租户行级隔离）
```

- 事件字段：`eventType`、`eventName`、`level`、`payload`、`occurredAt`。
- `payload` 按共享策略的 `maskingRules` 脱敏：字段名口径与遥测属性一致，`MASK_ALL`、`MASK_MIDDLE`、`ROUND_n` 均生效；非 JSON 对象 payload 原样返回。
- 审计动作 `QUERY_EVENTS`，记录策略、设备、时间范围、条数与来源 IP。
- limit 缺省 100，最大 1000。

### 5.5 前端

- 共享策略列表与详情展示“数据权限（最新属性/历史遥测/设备事件/回溯天数）”“有效期（生效中/未生效/已过期 + 区间）”“限流（QPS/日限）”，与后端执行口径一致。
- 事件勾选不再停留在“只入库不生效”。

## 6. Modbus 采集运行状态

`ModbusCollectorService` 增加内存状态表：

- `running`：任务是否仍在调度器注册。
- `lastCollectAt`：最近一次成功发布上报的时间。
- `lastAttemptAt`：最近一次采集尝试时间。
- `lastError`：最近一次失败原因；空表示最近一次成功。
- `consecutiveFailures`：连续失败次数，成功后清零。

接口：

- `GET /api/v1/modbus/collectors/{taskId}/status` 返回状态对象（原布尔值改为对象）。
- `GET /api/v1/modbus/collectors/runtime` 返回全部任务状态映射，前端列表一次拉取。

状态保存在连接器进程内存中，重启后清空；这是“当前运行态”而不是历史指标，历史采集结果仍以遥测数据为准。

前端采集任务列表新增“最近采集”“最近错误”列，运行状态不再显示“未查询”，并支持单行刷新状态。

## 7. 审计用户名回退

`AuditLogAspect` 优先读取 `X-User-Name`，为空时回退 `AppContextHolder.getUsername()`。这覆盖内部调用、网关未注入请求头、直连服务等场景；历史数据仍可能为空，前端继续降级显示“未记录用户名”。

## 8. 影响范围

- 后端：`firefly-api`（共享事件 DTO/Feign）、`firefly-connector`（SNMP v3、Modbus 状态）、`firefly-device`（导出范围、共享事件内部接口与 mapper）、`firefly-rule`（共享策略执行、限流、事件、审计）、`firefly-system`（审计用户名）、`firefly-common`（错误码）。
- 前端：`SnmpPage`、`ModbusPage`、`DeviceList`、`SharePage`、`services/api.ts`。
- 数据库：无表结构变更；复用 `share_policies`、`device_events`、`device_group_members`、`device_video_profiles`。

## 9. 风险与取舍

- **限流 fail-open**：Redis 故障时限流失效，换取共享读取可用性；需通过 `share rate limit check failed` 日志告警。
- **Modbus 状态不持久化**：连接器重启后状态清空，符合“运行态”定位；长期趋势应接入监控系统。
- **事件接口新增**：属于新增能力，旧消费方不受影响；需要确保 `share:read` 权限已分配给消费方角色。
- **导出密钥**：导出范围修正降低了误导出概率，但文件本身仍含设备密钥，需控制导出权限与下载链接有效期。
- **时间类型**：共享有效期使用 `LocalDateTime`，按服务端时区解释；跨时区部署时应在运维层统一时区。
