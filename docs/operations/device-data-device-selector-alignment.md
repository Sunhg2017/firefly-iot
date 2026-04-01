# 设备数据页设备选择收口运维说明

## 影响范围

- `firefly-web`
- `firefly-device`

## 发布内容

- 设备数据页查询入口从手工输入 `deviceId` 改为设备搜索选择器
- 设备事件列表返回体新增 `deviceName`
- 设备事件表格不再默认展示数据库主键

## 发布步骤

1. 发布 `firefly-device`
2. 发布 `firefly-web`
3. 清理浏览器缓存或刷新静态资源

建议顺序不要颠倒：先发后端，再发前端，避免前端先切到 `deviceName` 字段时拿到旧响应结构。

## 验证清单

### 页面验证

1. 打开 `设备数据`
2. 在“最新数据”页签搜索设备名称，确认可以选择设备而不是输入数字 ID
3. 切到“历史数据”“聚合统计”，确认同样使用设备下拉
4. 切到“设备事件”，确认筛选项为设备下拉 + 级别下拉
5. 查询后确认事件表格展示设备名称，不再展示 `deviceId`

### 接口验证

可直接校验：

```bash
curl -s http://localhost:9020/api/v1/device-events/list \
  -H 'Content-Type: application/json' \
  -d '{"pageNum":1,"pageSize":1}'
```

确认返回记录中包含 `deviceName` 字段。

## 常见问题

### 1. 页面下拉能选设备，但事件列表还是显示旧字段

排查：

1. 确认 `firefly-device` 已升级到本次版本
2. 直接调用 `/api/v1/device-events/list`，检查响应是否已有 `deviceName`
3. 若接口已有新字段，清理浏览器缓存后重试

### 2. 搜索设备后，下拉回显成数字

排查：

1. 确认前端已包含“保留已选设备选项”的版本
2. 检查浏览器是否混用了旧静态资源
3. 检查 `deviceApi.list` 是否返回了当前选中设备

### 3. 事件列表显示“设备信息缺失”

说明当前事件关联的设备记录已不存在，或批量回查未命中。先检查：

1. `device_events.device_id` 是否仍存在对应设备
2. `/api/v1/devices/{id}` 是否还能查到该设备
3. 若设备已删除，这是预期兜底表现，不再回退显示内部主键

## 回滚说明

如需回滚：

1. 回退 `firefly-device` 中 `DeviceEventVO` 与 `DeviceDataService`
2. 回退 `firefly-web/src/pages/device-data/DeviceDataPage.tsx`
3. 同步回退三份文档
