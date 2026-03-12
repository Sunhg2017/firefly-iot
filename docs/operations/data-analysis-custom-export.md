# 数据分析自定义导出运维说明

## 1. 模块说明

数据分析自定义导出由以下服务协同完成：

- `firefly-web`：提交导出任务与展示任务中心。
- `firefly-data`：查询时序数据、生成 CSV、上传结果文件。
- `firefly-support`：维护异步任务状态、统一下载与结果清理。
- MinIO：持久化导出文件。

## 2. 部署依赖

- PostgreSQL
- Redis
- Nacos
- MinIO
- `firefly-data`
- `firefly-support`
- `firefly-web`

## 3. 关键配置

### 3.1 `firefly-support`

- `async.task.storage-dir`
  - 作用：本地任务文件目录，仅用于 support 自身生成的本地结果文件或错误文件。
  - 默认值：`async-tasks`

### 3.2 MinIO

需要保证以下配置可用：

- `minio.endpoint`
- `minio.access-key`
- `minio.secret-key`
- `minio.bucket`

导出结果对象路径格式：

- `{tenantId}/exports/data-analysis/custom-export_{timestamp}_{uuid}.csv`

## 4. 运行流程

1. 前端调用 `POST /api/v1/analysis/export`。
2. `firefly-data` 注册异步任务。
3. `firefly-data` 后台执行查询与 CSV 生成。
4. 文件上传到 MinIO。
5. `firefly-support` 将任务状态更新为 `COMPLETED`。
6. 用户在任务中心下载时，由 `firefly-support` 生成 MinIO 预签名地址并重定向。

## 5. 监控与告警

建议关注以下指标或日志关键字：

- 导出任务创建失败
  - 关键日志：`创建导出任务失败`
- 导出任务执行失败
  - 关键日志：`Data export failed`
- MinIO 上传失败
  - 关键日志：`upload export file failed` 或 `MinIO upload failed`
- 任务下载失败
  - 关键日志：`任务不存在`、`not found`
- 截断导出
  - 任务 `errorMessage` 中包含“已按上限 50000 条截断”

告警建议：

- 连续 5 分钟内导出失败率超过 10%
- MinIO 上传失败连续超过 3 次
- 异步任务 `PROCESSING` 状态持续超过 10 分钟

## 6. 日志定位

### 6.1 `firefly-data`

重点日志：

- `Data export completed`
- `Data export failed`

定位建议：

- 先查任务 ID 是否创建成功。
- 再查对应任务 ID 的异步执行日志。
- 最后查 MinIO 上传是否返回 `objectName`。

### 6.2 `firefly-support`

重点日志：

- `Async task created`
- `Async task completion message sent`
- `Skip completing cancelled task`
- `Failed to send async task completion message`

定位建议：

- 查看任务状态是否处于租户正确上下文。
- 查看下载时是否识别为本地文件还是 MinIO 对象。

## 7. 常见故障与排查

### 7.1 任务创建成功，但下载 404

排查步骤：

- 确认 `async_tasks.result_url` 是否为空。
- 如果 `result_url` 是本地路径，检查 support 节点文件是否存在。
- 如果 `result_url` 是 MinIO `objectName`，确认对象是否在 bucket 中。
- 检查当前请求租户是否与任务 `tenant_id` 一致。

### 7.2 任务一直停留在 `PROCESSING`

排查步骤：

- 检查 `firefly-data` 是否存在异步线程异常。
- 检查数据库查询是否超时。
- 检查 MinIO 上传是否卡住。
- 检查 Nacos / Feign 调用是否异常导致 `completeTask` 未回写。

### 7.3 下载后文件内容为空

排查步骤：

- 确认筛选条件是否命中数据。
- 检查任务 `totalRows` 是否为 0。
- 确认时间范围是否正确。

### 7.4 文件结果被截断

说明：

- 当前自定义导出单任务保护上限为 50000 条。
- 任务成功时会在 `errorMessage` 中提示“已按上限 50000 条截断”。

处理建议：

- 缩小设备范围。
- 缩短时间窗口。
- 分批导出。

## 8. 回滚方案

### 8.1 代码回滚

- 回滚 `firefly-data`、`firefly-support`、`firefly-web` 到改造前版本。
- 重新部署后端与前端服务。

### 8.2 数据影响

- 本次不涉及数据库结构变更，无需执行 DDL 回滚。
- 已创建的 MinIO 导出文件不会自动删除，可通过任务中心删除或运维脚本清理。

### 8.3 风险提示

- 如果只回滚 `firefly-web` 不回滚后端，旧前端会继续按同步下载调用 `/analysis/export`，接口契约将不匹配。
- 因此回滚必须前后端同时进行。

