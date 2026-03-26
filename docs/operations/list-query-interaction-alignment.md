# 列表查询交互统一运维说明

## 适用范围

本文档适用于前端列表页查询交互统一后的部署、验证与排查，涉及：

- `firefly-web`

重点页面：

- 设备管理
- 视频监控
- 产品接入
- 设备联动规则
- 设备拓扑
- 审计日志
- 异步任务中心
- 定时任务管理
- 自定义协议解析
- OTA 升级
- 设备数据 -> 设备事件

## 发布检查

1. 执行 `npm run build`
2. 清理浏览器缓存或刷新静态资源 CDN
3. 确认页面已加载包含 `ff-query-card / ff-query-bar / ff-query-actions` 的新样式版本

## 验证清单

每个列表页至少验证以下行为：

1. 首次进入页面会自动加载一次列表
2. 修改输入框或下拉框后，列表不会立刻发起新查询
3. 点击 `查询` 后，列表按当前条件刷新到第一页
4. 点击 `重置` 后，筛选条件清空并重新加载第一页
5. 翻页后仍沿用上一次点击 `查询` 时提交的条件
6. 查询按钮位于筛选项末尾动作区，不再夹在输入框和下拉框中间

## 常见问题

### 1. 改筛选项后仍然自动查询

排查：

1. 检查页面是否仍把草稿筛选直接写进请求依赖数组。
2. 检查 `fetchData / loadRules / loadTopology` 是否错误依赖了 `draftFilters`。
3. 检查 `Select onChange` 是否还在直接调用查询方法。

### 2. 点击查询后没有刷新

排查：

1. 检查 `查询` 按钮是否只更新了草稿状态，没有同步写入已生效筛选。
2. 检查 `filters` 是否被 `useMemo` 或对象复用错误吞掉了变更。
3. 检查分页是否仍停留在旧页码，且当前页已无数据。

### 3. 查询按钮样式仍然不对

排查：

1. 检查页面查询区是否使用了 `ff-query-card`。
2. 检查是否还有旧页面继续使用 `Input.Search enterButton`。
3. 检查浏览器是否缓存了旧版 `global.css`。

## 回滚说明

如需回滚本次交互统一：

1. 回退 `firefly-web/src/styles/global.css`
2. 回退各列表页的 `draftFilters / filters` 改造
3. 同步回退：
   - `docs/design/list-query-interaction-alignment.md`
   - `docs/operations/list-query-interaction-alignment.md`
   - `docs/user-guide/list-query-interaction-alignment.md`
