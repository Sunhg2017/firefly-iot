# 消息与数据可靠性设计方案

> **版本**: v1.0.0
> **日期**: 2026-11-15
> **模块**: firefly-device、firefly-connector、firefly-rule、firefly-support

---

## 1. 背景

第二轮商用审计（P1-11～P1-16）指出：Kafka 单副本/无幂等、下行离线消息丢失、设备影子只在 Redis、告警并发双开、通知无重试、遥测写入放大、日志无保留清理。本方案逐项收口。

## 2. 设计

### 2.1 Kafka 生产/消费可靠性

- 生产端：`acks=all`、`enable.idempotence=true`、`retries=10`、`max.in.flight.requests.per.connection=5`、`delivery.timeout.ms=120000`。
- 消费端：`max-poll-records=200`、`max.poll.interval.ms=300000`、`ack-mode=record`、监听并发可配（`KAFKA_LISTENER_CONCURRENCY`）。
- 预建 topic 与 HA 编排见 [Kafka 可靠性](kafka-reliability.md)。

### 2.2 下行待投递队列

- `MqttDownstreamConsumer` 无在线路由时不再抛异常进 DLT，而是调用 `DownlinkPendingQueue.enqueue`：
  - Redis List `connector:downlink:pending:{deviceId}`，按设备隔离；
  - `messageId` 去重（`connector:downlink:seen:*`，TTL 60 分钟）；
  - 每设备上限 100 条、队列 TTL 24 小时（可配）。
- 设备重连时 `EmbeddedMqttConnectionManager` 发布 `DeviceReconnectedEvent`，`DownlinkPendingFlusher` 按序补发；发送失败停止并把剩余消息重新入队。
- 跨节点重连同样生效（队列在共享 Redis）。

### 2.3 设备影子 desired 落库

- 新增 `device_shadow` 表：`device_id` 主键、`tenant_id`、`desired JSONB`、`version`、`updated_at`。
- `updateDesired` 使用数据库原子合并：
  `desired = jsonb_strip_nulls(device_shadow.desired || delta)`、`version = version + 1`，避免多实例读改写丢更新。
- Redis 仅作缓存并设置 TTL（默认 7 天）；缓存缺失时从数据库回源 desired 并重建缓存。
- reported 仍只存 Redis（实时状态可重建）；读改写加设备级 Redis 锁（SETNX + Lua 安全释放）。

### 2.4 告警幂等与通知重试

- `alarm_records` 增加部分唯一索引：`(tenant_id, alarm_rule_id, device_id) WHERE status IN ('TRIGGERED','CONFIRMED')`；历史重复进行中记录在迁移中关闭。
- 创建告警改为 `INSERT ... ON CONFLICT DO NOTHING`；冲突时复用已存在记录且不再次派发通知。
- `NotificationSender` 对渠道投递做有界重试（默认 3 次、指数退避 200ms），最终失败写入通知记录。

### 2.5 遥测写入放大治理

- 新增 `device_telemetry_payload`：一条消息一行原始 payload，唯一键 `(tenant_id, device_id, message_id)`，`ON CONFLICT DO NOTHING` 保证重试幂等。
- `device_telemetry` 不再逐属性复制 `raw_payload`（新数据该列为空，历史数据保留）。
- 遥测写入路径增加设备信息本地缓存（60 秒），避免每条消息查询设备。
- 保留清理改为按 `ctid` 分批删除（单批 500 行、最多 200 批），并加 Redis 分布式锁避免多副本重复执行。
- CAGG 缺口补刷已实现：新增 `telemetry_cagg_refresh_state` 水位表，定时任务与启动异步补刷按水位调用 `refresh_continuous_aggregate` 回补停机缺口（详见遥测治理设计）。

### 2.6 日志保留

- 设备日志/设备事件/操作日志/审计日志新增定时清理任务与可配保留天数，详见 [日志保留](log-retention.md)。

## 3. 兼容与数据清理

- `device_telemetry.raw_payload` 历史数据保留但不再写入；建议上线后按保留策略自然过期或手工清理。
- 告警迁移会关闭历史重复进行中记录，保留最新一条。
- 旧的下行 DLT 消息不会再产生（改为待投递队列），历史 DLT 需人工补偿。

## 4. 风险

- 待投递队列使用 Redis，Redis 淘汰/重启可能丢失队列；建议队列 key 与业务缓存分实例或提高 maxmemory。
- 数据库原子合并依赖 PostgreSQL JSONB，`ctid` 分批删除依赖 PostgreSQL/TimescaleDB。
- 通知重试在同步调用线程内退避，高并发下需关注线程占用。
- 影子 reported 仍为 Redis 单副本，设备端需支持重新上报。

## 5. 关联文档

- [运维说明](../operations/message-data-reliability.md)
- [使用说明](../user-guide/message-data-reliability.md)
