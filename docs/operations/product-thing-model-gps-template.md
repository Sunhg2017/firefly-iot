# 产品物模型 GPS 定位仪模板运维说明
> 模块: `firefly-web`
> 日期: 2026-03-20
> 状态: Done

## 1. 适用范围

用于产品物模型模板库中 `GPS定位仪模板` 的发布验证、日常验收与问题排查。

## 2. 本次变更

- 模板库新增 `GPS定位仪模板`
- 可用于快速生成定位终端常见属性、事件、服务
- 不新增后端接口
- 不新增数据库结构
- 不涉及 Flyway SQL

## 3. 发布方式

发布最新 `firefly-web` 静态资源即可。

建议发布前执行：

```bash
cd firefly-web
npm run build
```

## 4. 验证步骤

1. 打开任意产品的“物模型”抽屉。
2. 在可视化编辑页点击 `模板库`。
3. 确认模板库中出现 `GPS定位仪模板` 卡片。
4. 点击 `追加模板` 或 `覆盖当前`。
5. 确认属性列表中出现以下定位字段：
   `latitude`、`longitude`、`speed`、`fixStatus`、`reportInterval`
6. 确认事件列表中出现：
   `sosAlarm`、`geofenceAlarm`、`lowBattery`
7. 确认服务列表中出现：
   `queryLocation`、`setReportInterval`
8. 保存物模型后重新打开抽屉，确认上述模板内容仍可正常读取。

## 5. 故障排查

### 5.1 模板库里看不到 GPS 定位仪模板

优先检查：

- 前端是否已经发布到包含本次改动的版本
- 浏览器是否仍在使用旧缓存
- 当前打开的是否为最新产品物模型抽屉页面

### 5.2 模板应用后字段不完整

优先检查：

- 是否误点了“追加模板”后被已有同名字段干扰理解
- 是否保存前切回了高级 JSON 并手工删改模板内容
- 浏览器控制台是否存在前端运行时错误

### 5.3 发布产品后模板不能覆盖

这是预期行为。

- 已发布产品只允许追加模板
- 不允许覆盖现有物模型定义

## 6. 回滚说明

如需回滚，回退以下前端文件并重新发布静态资源：

- `firefly-web/src/pages/product/ProductThingModelDrawer.tsx`

同时回退本次新增文档：

- `docs/design/product-thing-model-gps-template.md`
- `docs/operations/product-thing-model-gps-template.md`
- `docs/user-guide/product-thing-model-gps-template.md`
