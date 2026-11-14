# 时序数据治理 使用说明

> **适用角色**: 租户管理员、租户运维（需 `data:retention` 权限；只读用户仅可查看）
> **入口**: 租户工作区 → 「数据与任务」→「设备数据」→ 右上角「数据保留」

---

## 1. 能做什么

- 查看当前租户的时序数据保留天数（含全局默认值与可设置上限）。
- 为当前租户设置独立的保留天数（只能比全局默认更短或相同，不能超过全局上限）。
- 重置为全局默认。

> 原始数据超过保留天数后会被定时清理；小时级、天级的降采样聚合数据作为历史归档长期保留。

---

## 2. 操作步骤

1. 进入「设备数据」页面，点击右上角「数据保留」。
2. 弹窗展示：
   - 当前全局默认保留天数；
   - 可设置上限；
   - 当前是否使用默认值。
3. 在输入框填写保留天数（1 ~ 上限）。
4. 点击「保存」生效；点击「重置为默认」恢复全局默认。

保存后不会立即删除历史数据，实际清理由后台任务按 cron（默认每日 03:10）执行。

---

## 3. 接口

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/DEVICE/api/v1/device-data/retention` | `data:read` | 查询当前租户保留策略 |
| PUT | `/DEVICE/api/v1/device-data/retention` | `data:retention` | 设置保留天数，body：`{"retentionDays": 90}` |
| DELETE | `/DEVICE/api/v1/device-data/retention` | `data:retention` | 重置为全局默认 |
| POST | `/DEVICE/api/v1/device-data/downsample` | `data:read` | 降采样查询（HOUR / DAY） |

### 3.1 降采样查询示例

```json
{
  "deviceId": 1001,
  "property": "temperature",
  "startTime": "2026-01-01T00:00:00Z",
  "endTime": "2026-06-01T00:00:00Z",
  "granularity": "DAY"
}
```

返回：

```json
[
  {
    "bucket": "2026-05-31T00:00:00",
    "avgValue": 23.1,
    "maxValue": 30.2,
    "minValue": 15.4,
    "sumValue": 693.0,
    "sampleCount": 30,
    "lastValue": 22.8
  }
]
```

> 降采样依赖 TimescaleDB 连续聚合；未启用扩展时该接口不可用。

---

## 4. 注意事项与限制

- 保留天数上限为全局上限（默认 365 天），超过会提示参数错误。
- 设置更短保留天数只影响后续清理，不会立即删除已有数据。
- 清理任务跨租户执行，不依赖当前登录用户；执行记录见 firefly-device 日志。
- 降采样返回的是连续聚合结果，可能存在最长约 1 个刷新周期（小时级 1 小时、天级 1 天）的延迟；需要精确实时数据时请用「历史数据」或「聚合统计」。
- 原始数据超过保留期后不可恢复；如需长期保留原始数据，请将 `default-retention-days` 与上限调大并评估存储成本。

---

## 5. 关联文档

- [设计方案](../design/detailed-design-telemetry-governance.md)
- [运维说明](../operations/telemetry-governance-operations.md)
- [设备数据详细设计](../design/detailed-design-device-data.md)
