# HTTP 设备上下线与心跳管理运维说明
> 版本: v1.1.0
> 日期: 2026-03-19
> 状态: Done

## 1. 适用范围

用于 `firefly-connector` 中 HTTP 设备生命周期链路的部署、配置、联调和问题排查。

## 2. 配置项

## 2.1 应用配置

- `firefly.http.presence-timeout-seconds`
  - 默认 `300`
  - HTTP 设备离线超时阈值，单位秒

- `firefly.http.presence-sweep-interval-seconds`
  - 默认 `30`
  - 离线扫描周期，单位秒

## 2.2 环境变量

- `FIREFLY_HTTP_PRESENCE_TIMEOUT_SECONDS`
- `FIREFLY_HTTP_PRESENCE_SWEEP_INTERVAL_SECONDS`

已同步补充到：

- `deploy/.env.example`
- `deploy/docker-compose.yml`
- `deploy/docker-compose.prod.yml`

## 3. 运行机制

## 3.1 生命周期端点

HTTP 设备应通过以下端点表达生命周期动作：

- `/api/v1/protocol/http/online`
- `/api/v1/protocol/http/offline`
- `/api/v1/protocol/http/heartbeat`

同时兼容：

- `/api/v1/protocol/http/event/post` 上报 `identifier` 或 `eventType` 为 `online`
- `/api/v1/protocol/http/event/post` 上报 `identifier` 或 `eventType` 为 `offline`
- `/api/v1/protocol/http/event/post` 上报 `identifier` 或 `eventType` 为 `heartbeat`

行为说明：

- `/online`
  - 刷新在线标记
  - 必要时发布 `DEVICE_ONLINE`
  - 同时发布物模型内置 `online` 事件

- `/offline`
  - 立即清理在线标记和最近活跃索引
  - 立即发布 `DEVICE_OFFLINE`
  - 同时发布物模型内置 `offline` 事件

- `/heartbeat`
  - 刷新在线租约和最近活跃时间
  - 同时发布物模型内置 `heartbeat` 事件

## 3.2 普通业务流量

以下请求仍会刷新活跃时间：

- `/api/v1/protocol/http/property/post`
- `/api/v1/protocol/http/event/post`
- `/api/v1/protocol/http/data/{action}`

注意：

- `/event/post` 默认用于普通业务事件
- 但当 `identifier` 或 `eventType` 为 `online`、`offline`、`heartbeat` 时，connector 会自动补齐对应生命周期处理
- 因此现场排查时，需要同时检查“事件是否收到”与“生命周期是否同步触发”

## 3.3 超时离线

当设备长时间没有任何活跃请求，且在线标记 TTL 已过期时：

- connector 定时扫描会补发 `DEVICE_OFFLINE`
- 默认 `reason=heartbeat_timeout`
- `firefly-device` 消费后更新设备在线状态

## 4. 排查方式

## 4.1 HTTP 设备调用了上线事件但平台仍未在线

按以下顺序排查：

1. 确认客户端使用的是 `/api/v1/protocol/http/online` 或 `/event/post` 中的 `online`
2. 确认 `X-Device-Token` 有效，且是 `/auth` 最新签发的 token
3. 确认 connector 日志中存在 `HTTP device online`
4. 确认上游消息中同时出现 `DEVICE_ONLINE` 与 `online` 事件
5. 确认 `firefly-device` 正常消费生命周期消息

## 4.2 HTTP 设备主动离线后平台没有及时离线

按以下顺序排查：

1. 确认客户端调用的是 `/api/v1/protocol/http/offline`，或者 `/event/post` 中的 `offline`
2. 确认 connector 日志中存在 `HTTP device offline`
3. 检查 Redis 中对应在线标记是否已删除
4. 检查上游是否已产生 `DEVICE_OFFLINE`
5. 确认 `firefly-device` 生命周期消费链路正常

## 4.3 普通事件上报了生命周期事件，但平台状态没有变化

按以下顺序排查：

1. 检查事件体中的 `identifier` 或 `eventType` 是否准确为 `online`、`offline`、`heartbeat`
2. 检查 connector 是否命中了生命周期处理分支
3. 检查对应的 `DEVICE_ONLINE` / `DEVICE_OFFLINE` 是否已发布
4. 检查 `firefly-device` 是否正常消费生命周期消息
5. 检查事件体中是否带了离线原因 `reason`，避免排查时误判

## 4.4 HTTP 设备一直不离线

按以下顺序排查：

1. 检查 `FIREFLY_HTTP_PRESENCE_TIMEOUT_SECONDS` 是否设置过大
2. 检查 `FIREFLY_HTTP_PRESENCE_SWEEP_INTERVAL_SECONDS` 是否设置过大
3. 检查设备是否仍在持续发送属性、普通事件或心跳
4. 检查 Redis 最近活跃索引是否持续被刷新
5. 检查 connector 日志中是否出现 `HTTP device offline by timeout`

## 4.5 HTTP 设备频繁上下线抖动

优先检查：

1. 心跳间隔是否大于离线超时阈值
2. 设备是否在短时间内频繁 `/offline` 后又立即 `/online`
3. Redis 或消息系统是否存在明显抖动

建议：

- 心跳间隔至少小于离线超时的一半
- 默认配置下建议 30 到 120 秒

## 5. 回归验证

1. HTTP 设备完成 `/auth`
2. 调用一次 `/api/v1/protocol/http/online`
3. 检查设备状态是否变为 `ONLINE`
4. 调用一次 `/api/v1/protocol/http/heartbeat`
5. 检查物模型事件流中是否出现 `heartbeat`
6. 调用一次 `/api/v1/protocol/http/offline`
7. 检查设备状态是否立即变为 `OFFLINE`
8. 再次调用 `/event/post` 上报 `identifier=online`
9. 检查是否同样触发 `DEVICE_ONLINE` 与 `online` 事件

## 6. 回滚说明

如需回滚本次变更，应同时回滚：

- `firefly-connector` 的 HTTP 生命周期专用端点
- `HttpDeviceLifecycleService` 主动离线逻辑
- 普通事件接口上的生命周期识别逻辑
- 模拟器中 HTTP 生命周期端点调用逻辑

否则会出现“客户端仍走新端点，但服务端已回退”或“服务端要求新端点，但客户端还走旧入口”的不一致情况。
