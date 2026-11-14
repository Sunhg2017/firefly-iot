# 消息与数据可靠性运维说明

> **模块**: firefly-device、firefly-connector、firefly-rule、firefly-support
> **版本**: v1.0.0

---

## 1. 迁移

| 模块 | 迁移 | 内容 |
| --- | --- | --- |
| firefly-device | `V32__init_device_shadow.sql` | 影子 desired 权威表 |
| firefly-device | `V33__init_telemetry_payload.sql` | 遥测 payload 单存表 |
| firefly-device | `V34__add_log_retention_index.sql` | 日志清理索引 |
| firefly-device | `V35__init_cagg_refresh_state.sql` | CAGG 缺口补刷水位 |
| firefly-rule | `V9__idempotent_open_alarm.sql` | 历史重复告警合并 + 部分唯一索引 |
| firefly-system | `V43__add_log_retention_index.sql` | 审计日志清理索引 |

## 2. 配置项

| 配置 | 环境变量 | 默认 | 说明 |
| --- | --- | --- | --- |
| 下行队列 | `FIREFLY_DOWNLINK_PENDING_MAX_PER_DEVICE` | 100 | 每设备积压上限 |
| 下行队列 | `FIREFLY_DOWNLINK_PENDING_TTL_HOURS` | 24 | 队列 TTL |
| 下行队列 | `FIREFLY_DOWNLINK_SEEN_TTL_MINUTES` | 60 | 去重标记 TTL |
| 下行补发 | `FIREFLY_DOWNLINK_FLUSH_BATCH_SIZE` | 50 | 单次补发批量 |
| 影子 | `FIREFLY_SHADOW_REDIS_TTL_DAYS` | 7 | Redis 缓存 TTL |
| 影子 | `FIREFLY_SHADOW_LOCK_TTL_MS` | 3000 | 设备级锁 TTL |
| 遥测清理 | `FIREFLY_TELEMETRY_CLEANUP_BATCH_SIZE` | 500 | 单批删除行数 |
| 遥测清理 | `FIREFLY_TELEMETRY_CLEANUP_MAX_BATCHES` | 200 | 单次最多批次 |
| CAGG 补刷 | `FIREFLY_TELEMETRY_CAGG_REFRESH_ENABLED` | true | 是否启用缺口补刷 |
| CAGG 补刷 | `FIREFLY_TELEMETRY_CAGG_REFRESH_CRON` | `0 30 3 * * ?` | 定时补刷 cron |
| 通知重试 | `FIREFLY_NOTIFICATION_MAX_ATTEMPTS` | 3 | 最大尝试次数 |
| 通知重试 | `FIREFLY_NOTIFICATION_RETRY_BACKOFF_MS` | 200 | 退避基数 |

## 3. 指标与日志

- 指标：`firefly.connector.downlink.pending`（入队）、`firefly.connector.downlink.flushed`（补发）、`firefly.connector.downlink.deferred`（无路由延迟）。
- 日志关键字：`Downlink deferred`、`Flushed pending downlink`、`Device shadow rebuilt from database`、`Alarm open record already exists`、`Notification dispatch failed, retrying`。

## 4. 常见故障

| 现象 | 排查 |
| --- | --- |
| 设备重连后仍未收到指令 | 检查 `connector:downlink:pending:{deviceId}` 是否有积压；确认重连事件触发 |
| 待投递队列持续增长 | 设备长期离线或路由注册失败；检查 MQTT 鉴权与会话路由 |
| 影子 desired 丢失 | 检查 `device_shadow` 表是否有记录；Redis 回源日志 |
| 告警重复 | 确认 `uk_alarm_open_record` 索引已创建；检查迁移是否执行 |
| 通知大量失败 | 查看通知记录 error_message；确认渠道配置与网络 |
| 遥测清理慢 | 检查 `idx_device_*_created_at` 索引；调大/调小批次数 |

## 5. 回滚

- 代码回滚各服务镜像即可；新增表/索引为增量迁移，回滚不要求删除。
- 告警迁移会修改历史数据（关闭重复进行中记录），回滚代码不会恢复这些记录。
- 待投递队列中的消息在回滚后仍留在 Redis，可按需清理 `connector:downlink:pending:*`。

## 6. 后续

- CAGG 缺口补刷与 `drop_chunks` 块级保留。
- 通知 outbox 表与死信重投工具。
- 影子 reported 落库或独立 Redis 实例。
