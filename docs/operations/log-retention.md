# 设备日志/设备事件/操作日志/审计日志 定时保留清理 运维说明

> **模块**: firefly-device（`device_logs`、`device_events`）、firefly-system（`operation_logs`、`audit_logs`）
> **版本**: v1.0.0
> **关联文档**: [设计方案](../design/log-retention.md) · [使用说明](../user-guide/log-retention.md)

---

## 1. 部署与依赖

| 依赖 | 说明 |
| --- | --- |
| PostgreSQL | 复用现有数据库；删除目标表 `device_logs`、`device_events`、`operation_logs`、`audit_logs` 已存在，无需新迁移 |
| Redis | 分布式锁依赖 `StringRedisTemplate`，两服务均已引入 `spring-boot-starter-data-redis` |
| 调度 | `FireflyDeviceApplication`、`FireflySystemApplication` 均已开启 `@EnableScheduling`，无需额外配置 |
| 新增服务 | 无；随 `firefly-device`、`firefly-system` 发版 |

> 本功能不新增 Flyway 迁移。首次上线前如需为删除条件补索引，见第 7 节“索引建议”。

## 2. 配置项

### 2.1 firefly-device

| 配置 | 环境变量 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `firefly.logs.device-log-retention-days` | `FIREFLY_LOGS_DEVICE_LOG_RETENTION_DAYS` | 30 | 设备日志保留天数，按 `device_logs.created_at` 清理 |
| `firefly.logs.device-event-retention-days` | `FIREFLY_LOGS_DEVICE_EVENT_RETENTION_DAYS` | 90 | 设备事件保留天数，按 `device_events.created_at` 清理 |
| `firefly.logs.retention-cleanup-cron` | `FIREFLY_LOGS_RETENTION_CLEANUP_CRON` | `0 20 3 * * ?` | 清理任务执行时间，默认每日 03:20 |

### 2.2 firefly-system

| 配置 | 环境变量 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `firefly.logs.operation-log-retention-days` | `FIREFLY_LOGS_OPERATION_LOG_RETENTION_DAYS` | 90 | 操作日志保留天数，按 `operation_logs.created_at` 清理 |
| `firefly.logs.audit-log-retention-days` | `FIREFLY_LOGS_AUDIT_LOG_RETENTION_DAYS` | 180 | 审计日志保留天数，按 `audit_logs.created_at` 清理 |
| `firefly.logs.retention-cleanup-cron` | `FIREFLY_LOGS_RETENTION_CLEANUP_CRON` | `0 20 3 * * ?` | 清理任务执行时间，默认每日 03:20 |

说明：

- 保留天数小于 1 时任务内会按 1 天处理，避免误配 0/负数导致整表被清理。
- 两个服务使用同名 cron 配置键，可分别通过各自服务的环境变量或 Nacos 配置覆盖。
- `deploy/.env.example` 已增加上述环境变量；通过 `docker compose -f deploy/docker-compose*.yml` 部署时，
  若需生效还需把变量加入 compose 的 `x-java-service.environment` 映射，或直接在 Nacos 中配置
  （否则使用 `application.yml` 中的默认值）。

## 3. 执行机制

| 项目 | firefly-device | firefly-system |
| --- | --- | --- |
| 任务类 | `com.songhg.firefly.iot.device.job.LogRetentionJob` | `com.songhg.firefly.iot.system.job.LogRetentionJob` |
| 清理对象 | `device_logs`、`device_events` | `operation_logs`、`audit_logs` |
| Redis 锁 key | `lock:job:log-retention:device` | `lock:job:log-retention:system` |
| 锁 TTL | 10 分钟 | 10 分钟 |
| 单批行数 | 1000 | 1000 |
| 单次最多批数 | 100（单表单次最多约 10 万行） | 100 |

- 多副本部署时，同一模块同一时刻只有一个实例抢到锁执行，其余实例记录跳过日志后直接返回。
- 清理是**全局跨租户**的（Mapper 方法标注 `@InterceptorIgnore(tenantLine = "true")`），
  不读取当前租户上下文；不要试图在调度线程依赖租户上下文。
- 单表失败不会中断另一张表；调度入口有异常兜底，不会向 `TaskScheduler` 抛异常。

## 4. 日志定位

搜索关键字（`firefly-device` / `firefly-system` 服务日志）：

| 场景 | 日志内容 |
| --- | --- |
| 开始/结束汇总 | `Log retention cleanup finished: deviceLogsDeleted=..., deviceEventsDeleted=..., ...`（system 为 `operationLogsDeleted=..., auditLogsDeleted=...`） |
| 单表删除行数 | `Cleaned expired records: table=..., retentionDays=..., deleted=...` |
| 未抢到锁跳过 | `Skip log retention cleanup because lock is held by another instance: key=...` |
| 达到批次上限 | `Log retention cleanup reached max batches, remaining rows will be cleaned next run: ...` |
| 单表失败 | `Failed to clean expired records: table=..., retentionDays=..., deletedBeforeFailure=..., error=...` |
| 任务整体失败 | `Log retention cleanup job failed: ...` |
| 释放锁失败 | `Failed to release log retention lock: key=..., error=...` |

推荐按天巡检一次上述关键字；`deleted` 连续为 0 属于正常（数据未过期），但若长期没有
`Log retention cleanup finished` 则需要排查调度是否被关闭。

## 5. 手工核对

### 5.1 检查过期数据量

```sql
-- 设备日志（默认 30 天）
SELECT count(*) FROM device_logs WHERE created_at < now() - interval '30 days';
-- 设备事件（默认 90 天）
SELECT count(*) FROM device_events WHERE created_at < now() - interval '90 days';
-- 操作日志（默认 90 天）
SELECT count(*) FROM operation_logs WHERE created_at < now() - interval '90 days';
-- 审计日志（默认 180 天）
SELECT count(*) FROM audit_logs WHERE created_at < now() - interval '180 days';
```

### 5.2 检查分布式锁

```bash
redis-cli -h <redis-host> -p 6379 GET lock:job:log-retention:device
redis-cli -h <redis-host> -p 6379 TTL lock:job:log-retention:device
redis-cli -h <redis-host> -p 6379 GET lock:job:log-retention:system
redis-cli -h <redis-host> -p 6379 TTL lock:job:log-retention:system
```

- 正常情况下任务结束锁即被释放（key 不存在），TTL 为 `-2`。
- 若任务执行中应能看到对应实例的 UUID 值与剩余 TTL（不超过 600 秒）。
- 若不希望等待 TTL 过期且确认没有任务在跑，可手工 `DEL` 对应 key。

## 6. 常见故障与排查

| 现象 | 排查方向 |
| --- | --- |
| 日志中一直没有清理任务记录 | 确认服务启动类仍带 `@EnableScheduling`；确认 cron 配置能正常解析（cron 含空格时注意引号）；确认没有把 cron 写成 `-` 等非法值 |
| 每次都出现“跳过清理” | 检查另一副本是否卡在清理中；检查锁 TTL 与任务耗时是否匹配；必要时查看执行中实例的日志 |
| 数据没有按预期清理 | 用第 5.1 节 SQL 确认是否确有超期数据；确认实际生效的配置（Nacos 覆盖优先于本地 yml）；确认 `created_at` 是否被历史数据写成异常值 |
| 清理很慢、DB CPU 高 | 见第 7 节索引建议；可把 cron 调整到更低峰时段，或临时调小保留天数增量清理 |
| 单表清理报 `Failed to clean expired records` | 查看 error 明细；典型原因是数据库连接中断、锁等待超时、表/列名与当前环境不一致 |
| 任务报 `Tenant context not set` | 说明 Mapper 的 `@InterceptorIgnore(tenantLine = "true")` 被移除或 SQL 被其它拦截器改写；恢复注解后重启 |
| 手工清理接口与定时任务结果不一致 | 手工接口按当前租户执行，定时任务全局执行；两者保留天数参数独立 |

## 7. 索引建议（重要）

当前索引与清理条件的关系：

| 表 | 现有时间索引 | 全局 `created_at` 清理是否走索引 |
| --- | --- | --- |
| `device_logs` | `idx_device_logs_time(reported_at)` | 否（无 `created_at` 索引） |
| `device_events` | `idx_device_events_device(device_id, occurred_at DESC)` | 否 |
| `operation_logs` | `idx_oper_logs_time(created_at)` | 是 |
| `audit_logs` | `idx_audit_logs_created(tenant_id, created_at DESC)` | 否（前导列 `tenant_id`） |

数据量较大（百万级）时，建议在低峰期手工补索引，或由后续 Flyway 迁移统一落库：

```sql
-- 按需执行；执行前确认表体积与磁盘空间，大表建议 CONCURRENTLY（不能在事务中执行）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_device_logs_created_at ON device_logs (created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_device_events_created_at ON device_events (created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at);
```

> 本次改动范围不包含 Flyway 迁移，因此以上索引未自动创建；是否补齐由发布负责人决定。

## 8. 监控建议

- 日志告警：对 `Log retention cleanup job failed`、`Failed to clean expired records`、`Failed to release log retention lock` 配置告警。
- 执行结果监控：对 `Log retention cleanup finished` 的 `*Deleted` 做趋势记录；长期为 0 且表体积持续增长时排查。
- 表体积：`SELECT pg_total_relation_size('device_logs');`（其余表同理），与保留天数做对比校验。
- 锁健康：Redis `TTL lock:job:log-retention:*` 长期存在（接近 600 秒且反复出现）时检查是否有实例卡死。
- 数据库：关注清理时段的锁等待、慢查询与连接数。

## 9. 回滚

- 回退 `firefly-device` / `firefly-system` 镜像即可同时回退任务与 Mapper 变更；本功能无数据库结构变更，无需回滚 SQL。
- 若只想临时停用清理而不回滚镜像，可将 cron 改为永不触发的时间（例如
  `firefly.logs.retention-cleanup-cron=0 0 3 31 2 ?`，2 月 31 日不存在），
  或将保留天数调大。
- 已删除的日志无法恢复，回滚前务必确认保留天数配置是否符合预期。
- 若按第 7 节手工加过索引且需要撤销：`DROP INDEX CONCURRENTLY IF EXISTS idx_device_logs_created_at;`
  （其余索引同理）。
