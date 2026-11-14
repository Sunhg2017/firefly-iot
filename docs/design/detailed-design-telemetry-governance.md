# 时序数据治理（保留/降采样/归档）设计方案

> **版本**: v1.0.0
> **日期**: 2026-11-15
> **模块**: firefly-device（遥测治理）、firefly-system（权限台账）
> **状态**: Draft

---

## 1. 背景与问题

`device_telemetry` 是平台设备属性时序数据的主表，但当前存在明显治理缺口：

- `V4__init_device_data.sql` 中 `create_hypertable` 被注释，表实际为普通 PostgreSQL 表，没有按时间分块。
- 没有任何数据保留策略（retention），时序数据只增不减。
- 没有降采样（downsampling）能力，长周期聚合查询直接扫描原始行。
- 没有归档语义：原始数据过期后没有任何历史聚合数据可查。

风险：按设计文档的百万设备量级（约 550GB/天），当前实现会快速耗尽存储并拖慢查询。

> 部署侧说明：所有 compose 均使用 `timescale/timescaledb:latest-pg16` 镜像，TimescaleDB 扩展具备可用前提。

---

## 2. 目标

1. **启用超表**：把 `device_telemetry` 转为 TimescaleDB 超表，按 1 天分块；扩展不可用时优雅跳过，不阻断启动。
2. **数据保留**：支持全局默认保留天数 + 按租户覆盖（租户可设置更短保留期），由定时任务清理过期原始数据；同时保留 TimescaleDB 全局 drop_chunks 安全上限。
3. **降采样**：建立小时级、天级连续聚合，提供降采样查询 API，长周期查询走聚合视图。
4. **归档**：原始数据到期清理后，小时/天级聚合长期保留，作为历史归档数据。
5. **压缩**：对较早的原始数据块启用 TimescaleDB 压缩，降低存储占用。

非目标：

- 不做冷热分层到对象存储（MinIO）的物理归档；归档语义 = 保留降采样聚合。
- 不引入 Elasticsearch 等外部存储。

---

## 3. 总体设计

```
设备属性上报 ──► device_telemetry（超表，1 天分块）
                    │
                    ├─ 压缩策略：chunk 超过 7 天压缩（tenant_id+device_id 分段，ts 排序）
                    ├─ 全局保留上限：chunk 超过 365 天 drop_chunks（安全兜底）
                    ├─ 小时连续聚合 device_telemetry_hourly（长期保留）
                    └─ 天级连续聚合 device_telemetry_daily（长期保留）
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
            降采样查询 API        定时清理任务（按租户保留）
```

### 3.1 保留策略

| 层级 | 机制 | 默认值 |
| --- | --- | --- |
| 全局默认保留 | 定时任务（DELETE） | 90 天，可配置 `firefly.telemetry.default-retention-days` |
| 按租户覆盖 | 定时任务（DELETE，优先级高于全局默认） | 由 `tenant_telemetry_retention` 表配置 |
| 全局安全上限 | TimescaleDB `add_retention_policy`（drop_chunks） | 365 天（迁移内固定） |

- 租户覆盖值必须 ≤ 全局上限；小于全局默认时提前清理。
- 定时任务使用 `@InterceptorIgnore(tenantLine = "true")` 执行跨租户清理，避免租户上下文缺失导致失败。

### 3.2 降采样 / 归档

- `device_telemetry_hourly`：按 1 小时 + `tenant_id/device_id/product_id/property` 聚合，字段 `avg/max/min/sum/count/last`。
- `device_telemetry_daily`：按 1 天聚合，字段同上。
- 连续聚合刷新策略：小时视图滚动 3 天、天级滚动 30 天。
- 原始数据过期后，聚合视图继续保留，作为历史归档。

### 3.3 压缩

- `compress_segmentby = 'tenant_id, device_id'`、`compress_orderby = 'ts DESC'`，超过 7 天的 chunk 压缩。

---

## 4. 数据模型

```sql
CREATE TABLE tenant_telemetry_retention (
    tenant_id       BIGINT PRIMARY KEY,
    retention_days  INTEGER NOT NULL,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`device_telemetry` 字段不变，仅转为超表；新增两个连续聚合视图。

---

## 5. 接口设计

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/device-data/retention` | `data:read` | 查询当前租户保留策略（含默认值、上限、是否使用默认） |
| PUT | `/api/v1/device-data/retention` | `data:retention` | 设置当前租户保留天数 |
| DELETE | `/api/v1/device-data/retention` | `data:retention` | 重置为全局默认 |
| POST | `/api/v1/device-data/downsample` | `data:read` | 降采样查询（HOUR / DAY） |

降采样请求：

```json
{ "deviceId": 1, "property": "temperature", "startTime": "...", "endTime": "...", "granularity": "HOUR" }
```

响应：

```json
[{ "bucket": "...", "avgValue": 23.1, "maxValue": 30.0, "minValue": 15.2, "sumValue": 231.0, "sampleCount": 10, "lastValue": 22.5 }]
```

---

## 6. 配置项

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `firefly.telemetry.default-retention-days` | 90 | 全局默认保留天数 |
| `firefly.telemetry.global-max-retention-days` | 365 | 租户可设置的最大保留天数（与迁移内 drop_chunks 上限对齐） |
| `firefly.telemetry.retention-cleanup-cron` | `0 10 3 * * ?` | 清理任务执行时间 |

---

## 7. 关键取舍与风险

1. **超表启用条件化**：`CREATE EXTENSION` / `create_hypertable` 包在异常捕获块中，扩展缺失时保持普通表，服务仍可启动；此时降采样接口不可用（视图不存在）。
2. **按租户保留用 DELETE**：TimescaleDB 的 drop_chunks 只能按超表整体，无法按租户；因此按租户用 `DELETE ... USING` 行级删除，全局 drop_chunks 作为安全上限。
3. **连续聚合刷新策略**只覆盖近期数据；迁移内做有限回填（7 天），更早历史数据可由运维执行 `refresh_continuous_aggregate` 回填。
4. **清理任务逐日执行**：DELETE 大批量时可能持有较长锁；已按租户/默认两条语句收敛，后续可加批量删除。
5. **权限**：新增 `data:retention` 按钮权限，避免只读用户修改保留策略。

---

## 8. 关联文档

- [运维说明](../operations/telemetry-governance-operations.md)
- [使用说明](../user-guide/telemetry-governance.md)
- [设备数据详细设计](detailed-design-device-data.md)
