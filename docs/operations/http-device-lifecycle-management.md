# HTTP 设备上下线与心跳管理运维说明
> 版本: v1.0.0
> 日期: 2026-03-14
> 状态: Done

## 1. 适用范围

用于 `firefly-connector` 中 HTTP 设备接入链路的部署、配置和问题排查。

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

- HTTP 设备成功调用以下接口之一时，会刷新活跃时间：
  - `/api/v1/protocol/http/property/post`
  - `/api/v1/protocol/http/event/post`
  - `/api/v1/protocol/http/data/{action}`
  - `/api/v1/protocol/http/heartbeat`

- 当设备首次活跃时，connector 会发出 `DEVICE_ONLINE`
- 当设备长时间无活跃请求并超时后，connector 会发出 `DEVICE_OFFLINE`
- `firefly-device` 消费生命周期消息后，更新设备在线状态

## 4. 排查方式

## 4.1 HTTP 设备一直不在线

按以下顺序排查：

1. 确认设备不是只调用了 `/auth`，而是实际调用了业务上报或 `/heartbeat`
2. 确认 `X-Device-Token` 有效，未过期
3. 确认 connector 日志中存在 `HTTP device online`
4. 确认 Kafka `device.lifecycle` 主题可正常写入
5. 确认 `firefly-device` 正常消费生命周期消息

## 4.2 HTTP 设备一直不离线

按以下顺序排查：

1. 检查 `FIREFLY_HTTP_PRESENCE_TIMEOUT_SECONDS` 是否设置过大
2. 检查 `FIREFLY_HTTP_PRESENCE_SWEEP_INTERVAL_SECONDS` 是否设置过大
3. 检查设备是否仍在持续发送属性、事件或心跳
4. 检查 Redis 中最近活跃索引是否持续被刷新
5. 检查 connector 日志中是否出现 `HTTP device offline by timeout`

## 4.3 HTTP 设备频繁上下线抖动

优先检查：

1. 设备心跳间隔是否大于离线超时阈值
2. 设备发送频率是否接近扫描周期边界
3. Redis 或 Kafka 是否存在明显抖动

建议：

- 心跳间隔至少小于离线超时的一半
- 例如：心跳 60 秒，离线超时 300 秒

## 5. 回归验证

1. HTTP 设备完成 `/auth`
2. 调用一次 `/api/v1/protocol/http/heartbeat`
3. 检查设备状态是否变为 `ONLINE`
4. 停止所有 HTTP 请求
5. 等待超过 `presence-timeout-seconds`
6. 检查设备状态是否变为 `OFFLINE`

## 6. 回滚说明

如需回滚本次变更，应同时回滚：

- `firefly-connector` 的 HTTP 生命周期服务与心跳接口
- `firefly-connector` 调度启用
- HTTP 生命周期相关配置项

否则会出现“部署配置还在，但代码已不支持”或“代码已启用，但部署未注入配置”的不一致情况。
