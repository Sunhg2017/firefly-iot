# 产品物模型固有默认项设计说明
> 模块: `firefly-device` / `firefly-web`
> 日期: 2026-03-18
> 状态: Done

## 1. 背景

产品物模型需要平台统一维护一组默认能力项，但生命周期语义此前被错误放在 `services` 中，导致口径不准确：

- `online`、`offline`、`heartbeat` 本质上是设备上报的生命周期事件，不是下行可调用服务。
- 设备消息页把这三个默认项当成服务展示，会误导用户进行服务调用。
- 前后端默认物模型如果继续沿用旧口径，会持续放大事件和服务边界混乱的问题。

本次直接收口到新的唯一实现：`ip` 为固有属性，`online/offline/heartbeat` 为固有事件。

## 2. 目标

- 所有产品物模型都固定包含默认属性 `ip`。
- 所有产品物模型都固定包含固有事件 `online`、`offline`、`heartbeat`。
- 新建、读取、保存、导入统一走同一套归一化逻辑。
- 前端物模型抽屉中，固有属性和固有事件都可见但不可编辑、复制、删除或拖拽。
- 设备消息页只展示真实可调用的自定义服务，不再把生命周期事件当成服务选项。

## 3. 默认项定义

### 3.1 固有属性

平台内置一个默认属性：

- `identifier = ip`
- `name = IP地址`
- `description = 设备当前网络地址`
- `accessMode = r`
- `system = true`
- `readonly = true`
- `dataType.type = string`

### 3.2 固有事件

平台内置三个生命周期事件：

- `online`
- `offline`
- `heartbeat`

统一定义：

- `type = info`
- `system = true`
- `readonly = true`
- `lifecycle = true`
- `outputData = []`

## 4. 实现方案

### 4.1 后端统一补齐

统一组件 `ThingModelBuiltinDefinitionSupport` 负责物模型固有默认项归一化：

- `createDefaultThingModel()`：生成带默认属性和固有事件的默认物模型。
- `ensureBuiltinDefinitions(ObjectNode)`：对任意物模型补齐默认属性与固有事件。

归一化规则：

1. `properties/events/services` 缺失时自动补成数组。
2. `ip` 始终按平台定义重建，不接受用户自定义同名属性覆盖。
3. `online/offline/heartbeat` 始终按平台定义重建到 `events`，不接受用户自定义同名事件覆盖。
4. 如果旧物模型里把 `online/offline/heartbeat` 放在 `services`，归一化时直接从 `services` 剔除。
5. 自定义属性排在 `ip` 之后，自定义事件排在三个固有事件之后，`services` 只保留真实自定义服务。

### 4.2 接入链路

以下链路统一接入 `ThingModelBuiltinDefinitionSupport`：

- `ProductService#createProduct`
- `ProductService#getThingModel`
- `ProductService#updateThingModel`
- `ThingModelImportService#executeImportAsync`
- `ThingModelImportService#downloadAndParseExcel`

这样可以保证：

- 新建产品默认就带 `ip` 和三个固有事件
- 旧产品读取时自动修正到新口径
- 手工保存 JSON 时自动修正到新口径
- Excel/JSON 导入完成后最终落库版本仍然符合新口径

### 4.3 前端交互约束

`ProductThingModelDrawer` 同步升级为“固有默认项”模式：

- 默认物模型 JSON 中直接包含 `ip` 和三个固有事件
- 解析和格式化 JSON 时自动补齐 `ip` 与三个固有事件
- `ip` 在属性列表中展示为“固有属性”
- `online/offline/heartbeat` 在事件列表中展示为“固有事件”
- 固有属性和固有事件都不允许编辑、复制、删除、拖拽

`DeviceMessagePage` 同步调整为：

- 服务调用列表仅从产品物模型 `services` 中加载
- 不再内置 `online/offline/heartbeat` 服务兜底项
- 页面文案明确说明生命周期项属于事件，不属于服务

## 5. 风险与取舍

- 本次不保留“生命周期既是事件又是服务”的双轨逻辑，统一以事件口径为准。
- 历史库中旧产品不会立即批量回写；但一旦读取、保存或导入物模型，就会自动修正。
- 如果历史数据里曾手工维护过同名生命周期服务，本次会直接移除这些旧服务定义，这是预期行为。

## 6. 影响范围

- `firefly-device/src/main/java/com/songhg.firefly.iot.device.service.ProductService`
- `firefly-device/src/main/java/com/songhg.firefly.iot.device.service.ThingModelImportService`
- `firefly-device/src/main/java/com/songhg.firefly.iot.device.service.ThingModelBuiltinDefinitionSupport`
- `firefly-device/src/test/java/com/songhg.firefly.iot.device.service.ProductServiceTest`
- `firefly-web/src/pages/product/ProductThingModelDrawer.tsx`
- `firefly-web/src/pages/device-message/DeviceMessagePage.tsx`
