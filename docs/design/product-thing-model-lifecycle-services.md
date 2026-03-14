# 产品物模型固有生命周期服务设计说明

> 模块: `firefly-device` / `firefly-web`
> 日期: 2026-03-14
> 状态: Done

## 1. 背景

产品物模型原先允许 `services` 为空，导致不同产品的生命周期语义不统一：

- 新建产品默认没有“上线 / 离线 / 心跳”服务。
- 老产品读取物模型时也可能缺少这些固有服务。
- 导入物模型或手工编辑时，用户可能误删生命周期服务。
- 设备消息页调用服务时仍需手输 `serviceName`，容易与产品物模型不一致。

## 2. 目标

- 所有产品物模型都强制包含三个固有服务：`online`、`offline`、`heartbeat`。
- 新建、读取、保存、导入四条链路使用同一套补齐逻辑，避免口径分叉。
- 前端物模型编辑页可见这三个服务，但不允许编辑、复制、删除或拖拽。
- 设备消息页调用服务时，优先从设备所属产品的物模型服务列表中选择。

## 3. 设计方案

## 3.1 固有服务定义

平台内置三个生命周期服务，均放在 `services` 数组中，顺序固定在最前面：

- `online`：名称“上线”，描述“设备连接建立后上报在线状态”
- `offline`：名称“离线”，描述“设备断开或超时后上报离线状态”
- `heartbeat`：名称“心跳”，描述“设备周期性保活，维持在线状态”

公共字段：

- `callType = async`
- `system = true`
- `readonly = true`
- `lifecycle = true`
- `inputData = []`
- `outputData = []`

## 3.2 后端统一补齐

新增 `ThingModelBuiltinServiceSupport`，作为产品物模型的统一补齐组件：

- `createDefaultThingModel()`：生成带三类固有服务的默认物模型。
- `ensureBuiltinServices(ObjectNode)`：对任意物模型进行归一化。

归一化规则：

1. `properties/events/services` 不存在时自动补成数组。
2. 固有服务始终按固定定义重建，不接受用户自定义覆盖。
3. 自定义服务保留在固有服务之后。
4. 与固有服务同名的自定义项会被系统定义替换。

## 3.3 接入链路

以下链路统一接入归一化逻辑：

- `ProductService#createProduct`
- `ProductService#getThingModel`
- `ProductService#updateThingModel`
- `ThingModelImportService#executeImportAsync`

这样可以覆盖：

- 新建产品默认值
- 老产品读取时自动补齐
- 手工保存时自动修正
- 异步导入物模型后的最终落库

## 3.4 前端交互约束

`ProductThingModelDrawer` 增加内置服务识别与保护：

- `services` 页默认展示三类固有服务。
- 固有服务显示“固有服务”标记。
- 固有服务不可编辑、不可删除、不可复制、不可拖拽排序。
- 视觉编辑与 JSON 编辑共用同一套补齐逻辑，避免模式切换后服务丢失。

`DeviceMessagePage` 调整为：

- 先选择设备。
- 再根据设备所属产品自动加载物模型服务。
- `serviceName` 使用下拉选择，不再要求用户手输。
- 若加载失败，回退到三类固有服务。

## 4. 风险与取舍

- 生命周期语义在业界也常见于事件模型，但本次按业务要求统一落在 `services` 中，不兼容其他建模口径。
- 后端读取时会自动补齐老数据，因此不会要求用户先手工迁移历史产品。
- 对固有服务采用“系统定义覆盖同名项”的方式，优先保证平台契约稳定，而不是保留用户误配内容。

## 5. 影响范围

- `firefly-device/src/main/java/com/songhg/firefly.iot.device.service.ProductService`
- `firefly-device/src/main/java/com/songhg.firefly.iot.device.service.ThingModelImportService`
- `firefly-device/src/main/java/com/songhg.firefly.iot.device.service.ThingModelBuiltinServiceSupport`
- `firefly-web/src/pages/product/ProductThingModelDrawer.tsx`
- `firefly-web/src/pages/device-message/DeviceMessagePage.tsx`
