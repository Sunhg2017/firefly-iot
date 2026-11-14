# 设备日志/设备事件/操作日志/审计日志 定时保留清理 设计方案

> **模块**: firefly-device（`device_logs`、`device_events`）、firefly-system（`operation_logs`、`audit_logs`）
> **版本**: v1.0.0
> **关联文档**: [运维说明](../operations/log-retention.md) · [使用说明](../user-guide/log-retention.md)

---

## 1. 背景

在此之前只有遥测原始数据具备定时保留清理能力（`TelemetryRetentionJob` + `TelemetryRetentionService`）。
设备日志、设备事件、操作日志、审计日志虽然已有手工清理接口，但依赖人工调用，长期运行会持续膨胀：

| 表 | 所属服务 | 现状 |
| --- | --- | --- |
| `device_logs` | firefly-device | `DeviceLogService#cleanExpiredLogs(int days)` + `POST /api/v1/device-logs/clean`，仅手工触发 |
| `device_events` | firefly-device | 无任何清理入口 |
| `operation_logs` | firefly-system | `OperationLogService#cleanExpired(int days)` + `POST /api/v1/operation-logs/clean`，仅手工触发 |
| `audit_logs` | firefly-system | 无任何清理入口 |

## 2. 目标与非目标

### 2.1 目标

1. 两个服务各新增一个 `@Scheduled` 任务，按配置的保留天数自动清理上述四张表。
2. 保留天数与 cron 全部配置化，默认值满足常见合规与排障需求。
3. 多副本部署时同一时刻只有一个实例执行清理，避免重复删除与锁竞争。
4. 清理过程分批进行，避免单条大 DELETE 造成长事务、锁表和主从延迟。
5. 单次清理失败不影响调度线程后续执行，并保留可检索的日志。
6. 单元测试不依赖 Spring 容器、真实 Redis 与数据库。

### 2.2 非目标

- 不新增前端页面；保留天数通过配置中心/环境变量调整。
- 不支持按租户配置这四类日志的保留天数（按租户保留仍只适用于遥测数据）。
- 不改变现有手工清理接口的权限与语义。
- 不引入归档/冷存储，过期数据直接删除。

## 3. 架构与流程

```
firefly-device 进程                           firefly-system 进程
┌──────────────────────────────┐            ┌──────────────────────────────┐
│ LogRetentionJob              │            │ LogRetentionJob              │
│  @Scheduled(cron)            │            │  @Scheduled(cron)            │
│   └─ Redis 锁                │            │   └─ Redis 锁                │
│      lock:job:log-retention: │            │      lock:job:log-retention: │
│      device (TTL 10m)        │            │      system (TTL 10m)        │
│   ├─ DeviceLogMapper         │            │   ├─ OperationLogMapper      │
│   │   .deleteExpiredBatch    │            │   │   .deleteExpiredBatch    │
│   └─ DeviceEventMapper       │            │   └─ AuditLogMapper          │
│       .deleteExpiredBatch    │            │       .deleteExpiredBatch    │
└──────────────────────────────┘            └──────────────────────────────┘
              │                                            │
              └───────────────┬────────────────────────────┘
                              ▼
                    PostgreSQL（分批 DELETE ... LIMIT）
```

单次执行流程：

1. 调度线程触发 `cleanupExpiredLogs()`。
2. `setIfAbsent(lockKey, instanceId, 10min)` 抢 Redis 分布式锁。
3. 抢不到锁：记录“另一实例正在执行”的日志并直接返回。
4. 抢到锁：依次清理本模块负责的两张表，每张表按 `BATCH_SIZE=1000` 循环删除，
   最多 `MAX_BATCHES=100` 批；某批删除行数小于批大小时视为已清空并结束该表。
5. 单表异常只记录 error 日志（含失败前已删除行数），继续清理下一张表。
6. 汇总日志输出两张表的删除行数；`finally` 中比对锁持有者后释放锁。
7. 调度入口统一捕获所有异常，避免异常抛给 `TaskScheduler` 影响后续调度。

## 4. 接口与数据变更

### 4.1 Mapper 新增方法（SQL 全部位于 mapper.xml）

四个 Mapper 各新增一个批量删除方法，签名一致：

```java
@InterceptorIgnore(tenantLine = "true")
int deleteExpiredBatch(@Param("retentionDays") int retentionDays, @Param("batchSize") int batchSize);
```

| Mapper | 对应 XML（新增） | 表 | 时间列 |
| --- | --- | --- | --- |
| `DeviceLogMapper` | `mapper/device/DeviceLogMapper.xml` | `device_logs` | `created_at` |
| `DeviceEventMapper` | `mapper/device/DeviceEventMapper.xml` | `device_events` | `created_at`（TIMESTAMPTZ） |
| `OperationLogMapper` | `mapper/system/OperationLogMapper.xml` | `operation_logs` | `created_at` |
| `AuditLogMapper` | `mapper/system/AuditLogMapper.xml` | `audit_logs` | `created_at` |

SQL 模板（以 `device_logs` 为例，其余表仅替换表名）：

```sql
DELETE FROM device_logs
WHERE id IN (
    SELECT id
    FROM device_logs
    WHERE created_at < now() - make_interval(days => #{retentionDays})
    ORDER BY created_at
    LIMIT #{batchSize}
);
```

### 4.2 定时任务类

| 类 | 模块 | 清理对象 | 锁 key |
| --- | --- | --- | --- |
| `com.songhg.firefly.iot.device.job.LogRetentionJob` | firefly-device | `device_logs`、`device_events` | `lock:job:log-retention:device` |
| `com.songhg.firefly.iot.system.job.LogRetentionJob` | firefly-system | `operation_logs`、`audit_logs` | `lock:job:log-retention:system` |

两个任务类用同一个 cron 配置键 `firefly.logs.retention-cleanup-cron`，默认 `0 20 3 * * ?`；
锁 key 分模块隔离，因此两服务在同一时刻各执行一次互不影响。

### 4.3 配置项

详见[运维说明](../operations/log-retention.md#2-配置项)。默认值：

| 配置 | 默认值 |
| --- | --- |
| `firefly.logs.device-log-retention-days` | 30 |
| `firefly.logs.device-event-retention-days` | 90 |
| `firefly.logs.operation-log-retention-days` | 90 |
| `firefly.logs.audit-log-retention-days` | 180 |
| `firefly.logs.retention-cleanup-cron` | `0 20 3 * * ?` |

## 5. 关键设计取舍

### 5.1 全局清理，而不是按租户清理

调度线程没有 `AppContextHolder` 租户上下文，而 `TenantLineInnerInterceptor` 在无租户上下文时会直接
抛 `IllegalStateException`。因此：

- 清理语义定义为**全局运维清理**，四张表使用统一保留天数；
- Mapper 方法标注 `@InterceptorIgnore(tenantLine = "true")`（与 `TelemetryRetentionMapper` 的跨租户清理一致），
   SQL 中不拼 `tenant_id`；
- 手工清理接口保持不变（仍受租户拦截器约束），避免把“租户管理员手工清理”语义扩大成全库删除。

这样做的代价是这四类日志无法按租户差异化保留；若后续需要，应按遥测治理的方式单独设计
“租户保留策略表 + `@InterceptorIgnore` 关联查询”，而不是在定时任务里遍历租户。

### 5.2 时间基准使用数据库 `now()`

`created_at` 由应用写入，若在应用侧计算阈值再传参，多实例时钟偏差会导致各副本删除边界不一致。
SQL 统一使用 `now() - make_interval(days => ?)`，把边界计算交给数据库，且与现有
`TelemetryRetentionMapper` 的写法保持一致。

注意：`device_events.created_at` 为 `TIMESTAMPTZ`，`device_logs` / `operation_logs` / `audit_logs`
为 `TIMESTAMP`。后者与 `now()` 比较时按数据库会话时区做隐式转换，因此**部署须保证数据库会话时区与应用
写入时间使用的时区一致**（默认部署均为同一时区）。若跨时区部署，应改为显式带时区的时间列或调整会话时区。

### 5.3 分批删除 + 批次上限

单批 `LIMIT 1000`，单次最多 100 批（单表单次最多约 10 万行）：

- 避免单条 DELETE 长时间持锁、产生大事务与 WAL 膨胀；
- 大批量积压（例如首次上线清理历史数据）会在后续调度中逐步消化，不会长时间占用连接；
- 达到批次上限会输出 WARN 日志，便于运维判断是否需要临时调大 cron 频率或手工清理。

### 5.4 Redis 分布式锁

- 使用 `setIfAbsent(key, instanceId, Duration.ofMinutes(10))` 原子抢锁；
- 锁 TTL 10 分钟：大于单次清理预期耗时；实例崩溃未释放时也会自动过期，不会永久死锁；
- 释放锁前比对 `instanceId`，避免误删其他实例重新获取的锁；比对与删除非原子，
  极端竞态下最多提前释放一次，由 TTL 兜底，不影响正确性（下一次调度仍可正常加锁）；
- 抢不到锁属于正常多副本竞争，INFO 级别记录后跳过，不重试。

### 5.5 失败隔离

- 单表清理异常 → error 日志 + 返回已删除行数，继续下一张表；
- 锁获取/释放异常 → 分别由调度入口/释放方法兜底，不向调度线程抛出；
- 调度入口捕获 `Exception`，保证一次失败不会导致 `TaskScheduler` 后续调度中断。

## 6. 风险与未验证项

1. **索引缺失**：`device_logs` / `device_events` 没有 `created_at` 索引，`audit_logs` 只有
   `(tenant_id, created_at DESC)` 复合索引（前导列是 `tenant_id`）。按 `created_at` 做全局删除会走
   顺序扫描，大表上单批 DELETE 仍可能较慢。建议按需补充独立索引，详见运维文档“索引建议”。
   本次未新增 Flyway 迁移（不在本次改动范围内）。
2. **首次执行可能耗时较长**：历史数据多时首次调度会执行满 100 批，建议低峰期上线。
3. **时区假设**：见 5.2；跨时区部署需复核。
4. **未做端到端数据库验证**：本环境不运行 Maven/真实 PostgreSQL，仅完成编译与单元测试；
   `make_interval(days => ?)`、`DELETE ... WHERE id IN (SELECT ... LIMIT ?)` 需在联调环境执行一次确认。
5. **`.env.example` 与 compose 转发**：新增环境变量已写入 `deploy/.env.example`，但
   `deploy/docker-compose*.yml` 的 `x-java-service.environment` 未同步转发；通过 compose 部署时
   若要覆盖默认值，需同时补 compose 环境映射或使用 Nacos 配置。
