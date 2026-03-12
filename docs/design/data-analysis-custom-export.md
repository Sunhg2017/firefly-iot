# 数据分析自定义导出设计方案

## 1. 背景

数据分析页原有“自定义导出”直接由前端调用同步接口下载 CSV，存在以下不合理点：

- 导出链路绕过异步任务中心，不符合仓库“导入导出必须走异步任务中心”的强制规则。
- 属性筛选依赖用户手工输入属性名，容易输错，且无法联动设备上下文。
- 导出文件主视角使用 `device_id`，直接暴露数据库主键，不符合“优先使用业务唯一键”的规则。
- 导出结果如果由其他微服务生成，任务中心下载端只能识别本地文件路径，无法统一处理 MinIO 中的结果文件。
- 任务中心按任务 ID 直接读取详情、下载、删除时缺少租户隔离，存在跨租户访问风险。

## 2. 目标

- 将数据分析自定义导出改造成“创建任务 -> 后台异步执行 -> 结果进入任务中心 -> 统一下载”的标准链路。
- 将属性筛选改成基于设备和时间范围的联动可选项，减少手工输入。
- 导出内容和分析列表统一使用 `productKey + deviceName` 作为业务视角。
- 让任务中心同时支持本地结果文件和 MinIO 结果文件。
- 为任务详情、下载、删除、清理补齐租户隔离。

## 3. 范围

本次改造覆盖以下模块：

- `firefly-data`：数据分析查询、自定义导出任务注册、属性候选查询。
- `firefly-support`：异步任务结果下载、结果文件删除、租户隔离。
- `firefly-web`：数据分析页面的属性选择交互与异步导出体验。

不在本次范围内：

- 其他业务模块的同步导出逻辑。
- Excel/PDF 等新的导出格式。
- 历史导出任务的数据迁移。

## 4. 架构方案

### 4.1 总体流程

1. 前端在数据分析页选择设备、属性、时间范围。
2. 前端调用 `POST /api/v1/analysis/export` 注册导出任务。
3. `firefly-data` 通过 `AsyncTaskClient` 在 `firefly-support` 创建 `EXPORT` 任务。
4. `firefly-data` 在异步线程中查询时序数据，生成 CSV。
5. `firefly-data` 通过 `FileClient.uploadBytes` 将结果上传到 MinIO，并把 `objectName` 回写到异步任务。
6. 用户在任务中心点击下载时，`firefly-support` 判断结果是本地文件还是 MinIO 对象：
   - 本地文件：直接流式返回。
   - MinIO 对象：换取预签名地址后重定向下载。

### 4.2 前端交互方案

- 时间序列查询：
  - 先选择单个设备。
  - 再根据设备和时间范围查询可选属性，多选后发起查询。
- 聚合统计：
  - 先选择设备集合。
  - 再根据设备集合和时间范围查询单选属性。
- 设备统计：
  - 先选择单个设备。
  - 再根据设备和时间范围查询单选属性。
- 自定义导出：
  - 先选择设备集合。
  - 属性改为多选下拉，留空代表导出全部候选属性。
  - 点击按钮后只创建任务，不再前端拼接 blob 直接下载。

### 4.3 数据视角调整

查询和导出结果统一补齐以下业务字段：

- `product_key`
- `product_name`
- `device_name`
- `device_nickname`

导出 CSV 不再输出 `device_id`，避免数据库主键直接暴露给用户。

### 4.4 任务中心兼容设计

任务结果存储统一抽象为 `resultUrl`，但语义扩展为：

- 本地文件绝对路径。
- MinIO 对象 `objectName`。

`AsyncTaskFileService` 增加以下能力：

- 判断结果是否为本地文件。
- 为 MinIO 对象生成预签名下载地址。
- 删除本地文件或 MinIO 对象。

## 5. 接口设计

### 5.1 创建自定义导出任务

- 路径：`POST /api/v1/analysis/export`
- 权限：`analysis:export`
- 请求体：

```json
{
  "deviceIds": [101, 102],
  "properties": ["temperature", "humidity"],
  "startTime": "2026-03-12T00:00:00Z",
  "endTime": "2026-03-12T23:59:59Z",
  "format": "CSV"
}
```

- 返回：

```json
{
  "code": 0,
  "message": "success",
  "data": 12345
}
```

`data` 为异步任务 ID。

### 5.2 查询属性候选

- 路径：`POST /api/v1/analysis/properties/options`
- 权限：`analysis:read`
- 请求体：

```json
{
  "deviceIds": [101, 102],
  "startTime": "2026-03-12T00:00:00Z",
  "endTime": "2026-03-12T23:59:59Z"
}
```

- 返回：

```json
{
  "code": 0,
  "message": "success",
  "data": ["temperature", "humidity", "pressure"]
}
```

### 5.3 任务完成回写

`firefly-data` 异步执行完成后调用：

- 路径：`PUT /api/v1/async-tasks/{id}/complete`
- 参数：
  - `success`
  - `resultUrl`
  - `resultSize`
  - `totalRows`
  - `errorMessage`

其中 `resultUrl` 传 MinIO `objectName`，`resultSize` 传 CSV 字节大小。

## 6. 数据结构

### 6.1 导出结果结构

导出记录包含以下列：

- 时间
- 产品 Key
- 产品名称
- 设备名称
- 设备别名
- 属性
- 数值
- 字符值

### 6.2 任务元数据

创建任务时固定写入：

- `taskType = EXPORT`
- `bizType = DATA_ANALYSIS_EXPORT`
- `fileFormat = CSV`

## 7. 关键设计取舍

### 7.1 为什么仍然保留统一下载入口

原因：

- 前端已经统一依赖任务中心下载地址，不需要为不同微服务结果文件增加多套下载逻辑。
- 权限校验、任务状态判断、下载审计都能继续收敛在 support 服务。

### 7.2 为什么存 `objectName` 而不是公开 URL

原因：

- 公开 URL 不便于后续清理结果文件。
- `objectName` 可以在下载时动态换取预签名地址，也能在任务删除时准确删除 MinIO 对象。

### 7.3 为什么给导出设置 50000 条保护上限

原因：

- 避免在单次任务中拉取过大时间序列导致查询时间和内存占用失控。
- 超限时任务仍成功，但会在任务备注中标记“已截断”，防止静默丢失信息。

## 8. 风险与应对

- 风险：设备时间跨度过大导致候选属性查询变慢。
  - 应对：属性候选接口限制 200 个 distinct 属性，并复用时间范围过滤。
- 风险：用户取消任务时后台线程仍在执行。
  - 应对：任务中心在 `updateProgress` / `completeTask` 中对 `CANCELLED` 状态做幂等保护，避免取消后又被写回完成态。
- 风险：历史任务 `resultUrl` 可能混合本地路径和 MinIO 对象。
  - 应对：下载与删除逻辑同时兼容两种存储类型，不要求数据迁移。

