# 时序数据治理 运维说明

> **模块**: firefly-device（遥测表治理、保留清理任务）、firefly-system（权限台账）
> **版本**: v1.0.0

---

## 1. 部署与依赖

- 本次治理随 `firefly-device` 发布，无新增服务。
- 部署依赖 TimescaleDB 扩展：仓库内 `deploy/docker-compose*.yml` 均使用 `timescale/timescaledb:latest-pg16`，扩展默认可用。
- 迁移脚本 `V27__init_telemetry_governance.sql` 在服务启动时由 Flyway 执行：
  - 创建 `tenant_telemetry_retention` 表；
  - 若 `timescaledb` 扩展存在，则把 `device_telemetry` 转为超表、启用压缩与保留上限、创建小时/天级连续聚合。
  - 扩展缺失时脚本会 `RAISE NOTICE` 并跳过超表治理，服务仍正常启动（此时降采样接口不可用）。

## 2. 配置项（firefly-device）

| 配置 | 环境变量 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `firefly.telemetry.default-retention-days` | `FIREFLY_TELEMETRY_DEFAULT_RETENTION_DAYS` | 90 | 全局默认保留天数 |
| `firefly.telemetry.global-max-retention-days` | `FIREFLY_TELEMETRY_GLOBAL_MAX_RETENTION_DAYS` | 365 | 租户可设置上限，需与迁移脚本 drop_chunks 上限一致 |
| `firefly.telemetry.retention-cleanup-cron` | `FIREFLY_TELEMETRY_RETENTION_CLEANUP_CRON` | `0 10 3 * * ?` | 清理任务 cron |

> 修改 `global-max-retention-days` 时，必须同步新增迁移脚本调整 `add_retention_policy` 的 `drop_chunks` 上限，否则可能出现“任务删除到 365 天、但你配置了更长”的不一致。

## 3. 存储与策略

| 对象 | 类型 | 说明 |
| --- | --- | --- |
| `device_telemetry` | TimescaleDB 超表 | 原始遥测，1 天分块，7 天后压缩 |
| `device_telemetry_hourly` | 连续聚合 | 小时级降采样，长期保留 |
| `device_telemetry_daily` | 连续聚合 | 天级降采样，长期保留 |
| `tenant_telemetry_retention` | 普通表 | 按租户保留天数 |

## 4. 日志定位

- 清理任务执行：`Telemetry retention cleanup finished: overrideRows=..., defaultRows=..., defaultDays=...`
- 清理失败：`Telemetry retention cleanup job failed`
- 保留策略变更：`Telemetry retention updated/reset`
- 迁移期间 TimescaleDB 相关跳过：`CREATE EXTENSION` / `create_hypertable skipped` / `... continuous aggregate skipped` 的 NOTICE。

## 5. 常见故障与排查

| 现象 | 排查 |
| --- | --- |
| 降采样接口报“relation device_telemetry_hourly does not exist” | 确认数据库已安装 timescaledb 扩展，且 V27 迁移已执行；必要时手工执行迁移中的 `CREATE MATERIALIZED VIEW` |
| 数据没有按时清理 | 检查 `tenant_telemetry_retention` 是否配置了更长天数；检查清理 cron 是否启用；检查日志中是否有 DELETE 失败 |
| 数据被提前清理 | 检查是否误设了更短的 `retention_days`；全局 drop_chunks 上限为 365 天，超过该值的原始数据必然被清理 |
| 超表未启用 | `SELECT * FROM timescaledb_information.hypertables;` 确认；检查启动日志 NOTICE；确认扩展已创建 |
| 连续聚合不是最新 | 查看 `timescaledb_information.continuous_aggregates` 与作业状态 `timescaledb_information.jobs`；可手工 `CALL refresh_continuous_aggregate(...)` 回填 |

## 6. 历史数据回填（可选）

迁移只回填近 7 天聚合数据。更早历史可按需执行：

```sql
CALL refresh_continuous_aggregate('device_telemetry_hourly', now() - INTERVAL '180 days', now() - INTERVAL '1 hour');
CALL refresh_continuous_aggregate('device_telemetry_daily', now() - INTERVAL '730 days', now() - INTERVAL '1 day');
```

> 回填会占用 IO/CPU，建议在低峰期执行，并按时间窗口分批。

## 7. 监控建议

- 表/分块体积：`SELECT * FROM hypertable_detailed_size('device_telemetry');`
- 压缩情况：`SELECT * FROM chunk_compression_stats('device_telemetry');`
- 连续聚合作业：`SELECT job_id, application_name, last_run_status, last_successful_finish FROM timescaledb_information.job_stats;`
- 保留清理结果：对日志关键字做告警；或对 `tenant_telemetry_retention` 与超表数据量做趋势监控。

## 8. 回滚

- 治理为纯新增：回退 `firefly-device` / `firefly-system` / `firefly-web` 镜像即可。
- 如需彻底撤销 TimescaleDB 治理，可手工：
  - `SELECT remove_retention_policy('device_telemetry');`
  - `SELECT remove_compression_policy('device_telemetry');`
  - `DROP MATERIALIZED VIEW IF EXISTS device_telemetry_hourly;` / `..._daily;`
  - 超表回退普通表成本较高，一般不建议；如需回退请先备份。
- `V41` 权限迁移为幂等写入，回滚不要求删除数据。

## 连续聚合（CAGG）缺口补刷

### 迁移

`firefly-device` 迁移 `V35__init_cagg_refresh_state.sql` 创建 `telemetry_cagg_refresh_state`（CAGG 补刷水位）。

### 配置

| 配置 | 环境变量 | 默认 | 说明 |
| --- | --- | --- | --- |
| `firefly.telemetry.cagg-refresh-enabled` | `FIREFLY_TELEMETRY_CAGG_REFRESH_ENABLED` | `true` | 是否启用补刷 |
| `firefly.telemetry.cagg-refresh-on-startup` | `FIREFLY_TELEMETRY_CAGG_REFRESH_ON_STARTUP` | `true` | 启动后异步补刷一次 |
| `firefly.telemetry.cagg-refresh-cron` | `FIREFLY_TELEMETRY_CAGG_REFRESH_CRON` | `0 30 3 * * ?` | 定时补刷 cron |
| `firefly.telemetry.cagg-refresh-batch-hours` | `FIREFLY_TELEMETRY_CAGG_REFRESH_BATCH_HOURS` | `24` | 单批刷新区间（小时） |
| `firefly.telemetry.cagg-refresh-max-lookback-days` | `FIREFLY_TELEMETRY_CAGG_REFRESH_MAX_LOOKBACK_DAYS` | `30` | 无水位时最大回看天数 |
| `firefly.telemetry.cagg-refresh-overlap-minutes` | `FIREFLY_TELEMETRY_CAGG_REFRESH_OVERLAP_MINUTES` | `10` | 与上次水位重叠分钟数 |

### 验证

```sql
SELECT cagg_name, refreshed_until, updated_at FROM telemetry_cagg_refresh_state;
```

- 日志关键字：`CAGG gap refresh finished`、`CAGG gap refresh failed`、`skipped because another instance holds the lock`。
- 锁 key：`lock:job:telemetry-cagg-refresh`，TTL 10 分钟。

### 故障排查

| 现象 | 排查 |
| --- | --- |
| 水位不前进 | 检查 TimescaleDB 是否可用、`refresh_continuous_aggregate` 是否有权限；看 `CAGG gap refresh failed` 日志 |
| 补刷范围过大 | 调小 `max-lookback-days`/`batch-hours`，或手工设置水位 |
| 多副本重复执行 | 确认 Redis 可用；锁竞争时只有一个实例执行 |
