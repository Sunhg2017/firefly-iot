# 下行消息持久化投递（Outbox）运维说明

## 1. 部署方式

- `firefly-device` Flyway `V36` 建 `downlink_outbox`；`firefly-connector` 与 `firefly-device` 需同步发布（新增 `device.message.down.ack` topic）。
- 无新增中间件；Kafka 需存在/自动创建 `device.message.down.ack`。

## 2. 监控与日志

- 重发日志：`Downlink outbox retry processed N pending records`。
- 置 FAILED：`达到最大重试次数仍未收到投递回执`（`last_error` 记录原因）。
- 回执失败（connector）：`Failed to publish downlink ack`（warning）。

## 3. 常见故障与排查

| 现象 | 可能原因 | 处置 |
| --- | --- | --- |
| 下行指令一直 PENDING | 设备长期离线 | 属预期；达到 `max-attempts` 后置 FAILED |
| FAILED 堆积 | 设备离线超时/路由异常 | 查 `downlink_outbox` 的 `last_error`，人工重发或清理 |
| 重复投递 | 重连快速补发 + outbox 重发叠加 | 设备按 `message_id` 幂等；属至少一次语义 |
| 回执不生效 | `device.message.down.ack` topic 缺失 | 确认 Kafka 自动建 topic 或预建该 topic |

## 4. 数据清理

`downlink_outbox` 会随下行指令增长；DELIVERED 与 FAILED 记录建议按保留策略定时清理（当前未内置清理任务，需在后续补归档/清理）。

## 5. 回滚

- 回退 `firefly-device` / `firefly-connector` 镜像并删除 `downlink_outbox` 表与 V36 记录即可；Redis 待投递队列仍按原逻辑工作，退化为非持久投递。
