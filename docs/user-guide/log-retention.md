# 设备日志/设备事件/操作日志/审计日志 定时保留清理 使用说明

> **适用版本**: v1.0.0
> **关联文档**: [设计方案](../design/log-retention.md) · [运维说明](../operations/log-retention.md)

---

## 1. 适用角色与场景

| 角色 | 可做的事情 |
| --- | --- |
| 平台运维 / 系统管理员 | 调整各类日志的保留天数与清理执行时间；查看清理日志与结果 |
| 租户管理员 | 查询本租户设备日志、操作日志；通过既有手工接口清理本租户过期设备日志/操作日志 |
| 普通用户 | 无清理操作权限，仅按原有权限查询日志 |

适用场景：

- 设备日志、设备事件、操作日志、审计日志持续增长，需要定期自动删除过期数据；
- 合规要求审计日志至少保留一段时间（默认 180 天），到期后自动清理；
- 需要在不改代码的前提下按环境调整保留期限。

## 2. 自动清理的使用方式

功能上线后默认已启用，无需页面操作：`firefly-device` 与 `firefly-system` 各有一个每日 03:20 执行的
定时任务，分别清理本模块负责的两张表。

### 2.1 调整保留天数

| 日志类型 | 所属服务 | 配置项 | 默认值 |
| --- | --- | --- | --- |
| 设备日志 | firefly-device | `firefly.logs.device-log-retention-days` | 30 天 |
| 设备事件 | firefly-device | `firefly.logs.device-event-retention-days` | 90 天 |
| 操作日志 | firefly-system | `firefly.logs.operation-log-retention-days` | 90 天 |
| 审计日志 | firefly-system | `firefly.logs.audit-log-retention-days` | 180 天 |

### 2.2 调整执行时间

两个服务统一使用 `firefly.logs.retention-cleanup-cron`，默认 `0 20 3 * * ?`（每日 03:20）。

### 2.3 配置示例

本地/容器环境变量（推荐与 `deploy/.env.example` 保持一致）：

```bash
FIREFLY_LOGS_DEVICE_LOG_RETENTION_DAYS=30
FIREFLY_LOGS_DEVICE_EVENT_RETENTION_DAYS=90
FIREFLY_LOGS_OPERATION_LOG_RETENTION_DAYS=90
FIREFLY_LOGS_AUDIT_LOG_RETENTION_DAYS=180
FIREFLY_LOGS_RETENTION_CLEANUP_CRON=0 20 3 * * ?
```

Nacos 配置（`firefly-device` / `firefly-system` 各自配置）：

```yaml
firefly:
  logs:
    device-log-retention-days: 30
    device-event-retention-days: 90
    retention-cleanup-cron: "0 20 3 * * ?"
```

```yaml
firefly:
  logs:
    operation-log-retention-days: 90
    audit-log-retention-days: 180
    retention-cleanup-cron: "0 20 3 * * ?"
```

说明：

- 保留天数小于 1 时按 1 天处理。
- 配置修改后需重启对应服务生效（当前未接入动态刷新）。
- 通过 `docker compose` 部署时，环境变量还需在 compose 的 `x-java-service.environment` 中转发，
  否则以 `application.yml` 默认值为准；也可直接使用 Nacos 配置覆盖。

## 3. 手工清理（补充手段）

定时任务已覆盖日常清理，以下接口仅用于一次性清理或临时排查。手工清理**只作用于当前登录租户**，
与定时任务的全局清理语义不同。

### 3.1 清理设备日志

- 接口：`POST /api/v1/device-logs/clean?days=<保留天数>`
- 服务：firefly-device（示例端口 9020）
- 权限：`device-log:delete`

```bash
curl -X POST -H "Authorization: Bearer <token>" \
  "http://<device-host>:9020/api/v1/device-logs/clean?days=30"
```

返回示例（`data` 为实际删除行数）：

```json
{
  "code": 0,
  "message": "success",
  "data": 128
}
```

### 3.2 清理操作日志

- 接口：`POST /api/v1/operation-logs/clean?days=<保留天数>`
- 服务：firefly-system（示例端口 8081）
- 权限：`operation-log:delete`

```bash
curl -X POST -H "Authorization: Bearer <token>" \
  "http://<system-host>:8081/api/v1/operation-logs/clean?days=90"
```

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": 36
}
```

### 3.3 设备事件与审计日志

当前**没有**手工清理接口，只能通过定时任务清理；如需立即清理，请通过[运维说明](../operations/log-retention.md)
中的 SQL 核对方式确认数据后，由 DBA 按变更流程处理。

## 4. 验证清理结果

### 4.1 查看服务日志

在 `firefly-device` 日志中搜索：

```
Log retention cleanup finished: deviceLogsDeleted=..., deviceEventsDeleted=...
```

在 `firefly-system` 日志中搜索：

```
Log retention cleanup finished: operationLogsDeleted=..., auditLogsDeleted=...
```

单表执行明细为 `Cleaned expired records: table=..., retentionDays=..., deleted=...`。

### 4.2 查看剩余超期数据

```sql
SELECT count(*) FROM device_logs    WHERE created_at < now() - interval '30 days';
SELECT count(*) FROM device_events  WHERE created_at < now() - interval '90 days';
SELECT count(*) FROM operation_logs WHERE created_at < now() - interval '90 days';
SELECT count(*) FROM audit_logs     WHERE created_at < now() - interval '180 days';
```

清理完成后上述计数应接近 0。若长时间不为 0，请检查[运维说明](../operations/log-retention.md)中的
“常见故障与排查”和“索引建议”。

## 5. 注意事项与限制

1. **删除不可恢复**：清理是物理删除，不做归档/回收站；调小保留天数前请确认合规与排障需求。
2. **全局清理**：定时任务按全局统一保留天数删除，不区分租户；租户无法单独设置这四类日志的保留天数。
3. **多副本安全**：任务使用 Redis 分布式锁，同一模块同一时刻只有一个实例执行；抢不到锁的实例直接跳过。
4. **执行时间**：任务串行清理两张表，单批 1000 行、单次最多 100 批；积压数据较多时会分摊到多次调度中。
5. **首次上线**：历史数据可能较多，首次调度耗时相对更长，建议在低峰期上线并观察数据库负载。
6. **手工清理差异**：手工接口按当前租户执行；定时任务是跨租户全局执行，两者互不影响。
7. **无前端页面**：保留天数当前通过配置调整，不提供页面入口。
8. **默认值依据**：审计日志默认 180 天、操作日志默认 90 天、设备事件默认 90 天、设备日志默认 30 天；
   如行业规范有更长要求，请上线前调大对应配置。
