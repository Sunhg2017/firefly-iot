# 共享数据与连接器能力补齐运维说明

> 模块: `firefly-rule`、`firefly-device`、`firefly-connector`、`firefly-system`、`firefly-web`
> 日期: 2026-11-15
> 关联设计: [共享数据与连接器能力补齐设计说明](../design/shared-data-and-connector-remediation.md)

## 1. 部署顺序

本次包含跨服务 Feign 接口新增与返回结构变更，按以下顺序滚动发布：

1. `firefly-common`、`firefly-api`（先发布依赖包/镜像）。
2. `firefly-device`（共享事件内部接口、导出范围）。
3. `firefly-rule`（共享策略执行、事件外部接口）。
4. `firefly-connector`（SNMPv3、Modbus 状态）。
5. `firefly-system`（审计用户名回退）。
6. `firefly-gateway`（如需刷新路由，无新增路由）。
7. `firefly-web`（前端页面）。

兼容性说明：

- 共享事件接口为新增，旧消费方不调用即不受影响。
- Modbus `collectors/{taskId}/status` 返回值由 Boolean 变为对象，仅控制台使用；如存在第三方调用，需要同步升级。
- 导出 DTO 新增字段为可选，旧客户端不传时行为不变。

## 2. 配置与依赖

### 2.1 Redis（共享限流）

- 共享限流依赖 `firefly-rule` 已有的 `StringRedisTemplate`，无新增配置项。
- Key：
  - `firefly:share:rate:{policyId}:qps:{epochSecond}`，TTL 2 秒；
  - `firefly:share:rate:{policyId}:daily:{yyyyMMdd}`，TTL 2 天。
- Redis 不可用时接口 **fail-open**（继续提供共享数据），日志输出：
  `Share rate limit check failed, fail-open for policy {id}: ...`
- 需要为上述日志配置告警；若安全要求必须限流，应将实现改为 fail-closed 并增加本地桶降级。

### 2.2 SNMP

- 连接器需能访问设备 UDP 161。
- v3 使用 USM：认证协议 MD5/SHA/SHA224/SHA256/SHA384/SHA512；加密 DES/AES128/AES192/AES256/3DES。
- 口令至少 8 位；认证/加密协议与设备侧必须一致，否则表现为超时或 `unknown user`。
- SNMP 服务初始化时已注册 USM；重载插件不影响 USM 用户（按请求动态注册）。

### 2.3 数据库

无表结构变更。复用：

- `share_policies.rate_limit`、`share_policies.validity`、`share_policies.data_permissions`；
- `device_events`；
- `device_group_members`；
- `device_video_profiles`。

## 3. 发布后验证

### 3.1 共享策略

```bash
# 1) 事件权限：策略 events=true 时可读取；false 时返回 5006
curl -H "Authorization: Bearer $TOKEN" \
  "http://gateway/api/v1/shared/devices/31/events?policyId=7&limit=10"

# 2) 有效期：把 endTime 改为昨天后再次调用，应返回 14002
# 3) 限流：qps=1 时连续调用两次，第二次应返回 14001
```

检查 Redis：

```bash
redis-cli keys 'firefly:share:rate:*'
redis-cli ttl 'firefly:share:rate:7:qps:<epochSecond>'
```

### 3.2 导出

1. 设备列表按分组筛选，记录总数 N。
2. 点击“导出当前筛选三元组”，任务完成后校验导出行数是否等于 N。
3. 勾选设备导出时，校验只包含勾选设备。
4. 含视频设备的租户，确认导出结果不包含视频设备（列表已排除时）。

### 3.3 SNMPv3

1. 调试工具选择 v3，填写安全名称/协议/口令，点击“测试连接”。
2. 失败时按以下顺序排查：
   - 设备侧 USM 用户名、认证/加密协议与口令；
   - 连接器到设备 UDP 161 可达；
   - 口令长度 ≥ 8；
   - 设备是否开启 v3。
3. 采集任务使用 v3 时，确认任务注册成功并可读取 OID。

### 3.4 Modbus 状态

1. 打开 Modbus 采集任务页，确认“运行状态 / 最近采集 / 最近错误”列有值。
2. 断开设备后等待一个采集周期，确认“最近错误”出现、连续失败次数递增。
3. 恢复设备后，确认最近采集时间更新、错误清空、连续失败次数归零。

### 3.5 审计用户名

1. 通过网关调用一个带 `@Auditable` 的接口。
2. 查看审计详情，确认用户名有值；内部调用（无 `X-User-Name`）时应回退登录上下文。

## 4. 监控与日志

| 关注点 | 日志/指标 | 说明 |
| --- | --- | --- |
| 共享限流 | `SHARE_RATE_LIMITED` 返回、Redis key 增长 | 频繁 14001 说明策略上限过低或存在异常调用 |
| 限流降级 | `Share rate limit check failed, fail-open` | Redis 故障，需要立即处理 |
| 共享策略失效 | `共享策略尚未生效或已过期`、`SHARE_POLICY_NOT_EFFECTIVE` | 检查策略有效期配置 |
| 事件读取 | 审计动作 `QUERY_EVENTS`、`读取共享设备事件失败` | 失败时检查 device 服务内部接口 |
| SNMPv3 | `SNMP request timed out`、USM 相关异常 | 多为协议/口令不匹配 |
| Modbus 采集 | `Modbus collect failed`、`lastError` | 连续失败需检查设备与网络 |
| 导出 | 异步任务失败日志、任务中心错误信息 | 检查筛选条件与数据量 |

## 5. 常见故障

### 5.1 共享事件返回 5006（无权限）

- 策略 `dataPermissions.events` 是否为 `true`；
- 消费方角色是否具备 `share:read`；
- 策略状态是否仍为 `APPROVED`。

### 5.2 共享事件返回 5004/8001（设备不存在）

- `policyId` 是否属于当前消费方；
- 设备是否在策略 `scope` 内；
- 设备是否属于策略所有方租户。

### 5.3 共享调用返回 14001

- 查看策略 `rateLimit` 的 `qps` / `dailyLimit`；
- 检查是否存在重试风暴或前端轮询；
- 必要时临时调高上限（需重新审批策略）。

### 5.4 SNMPv3 一直超时

- 设备侧是否配置了相同 `securityName`；
- 认证协议是否为设备支持的算法（部分设备只支持 MD5/SHA1）；
- 加密协议与口令是否匹配；
- 是否存在防火墙只放行 v2c。

### 5.5 Modbus 状态为空

- 连接器重启后状态清空，等待一个采集周期；
- 任务未注册或已被移除时 `running=false`；
- `/modbus/collectors/runtime` 是否可达。

## 6. 回滚

- 回滚顺序与发布相反：web → system → connector → rule → device → api/common。
- 无数据库迁移，无需回滚数据。
- 回滚 `firefly-rule` 后共享事件接口不可用，前端共享策略页面仍可正常展示配置。
- 回滚 `firefly-connector` 后 Modbus 状态接口恢复布尔值，旧前端页面会显示“状态加载中”，需要同步回滚前端。
- Redis 中的限流 key 会自然过期，无需手工清理。
