# 产品物模型固有默认项设计说明
> 模块: `firefly-device` / `firefly-web`
> 日期: 2026-03-18
> 状态: Done

## 1. 背景

产品物模型之前只对生命周期服务做了固有补齐，默认属性仍然为空，导致以下问题：

- 新建产品后，平台约定的基础网络属性没有统一口径。
- 旧产品读取物模型时，无法自动补齐 `ip` 这类平台默认属性。
- 用户在可视化编辑、JSON 编辑或异步导入后，前后端对默认属性的理解可能不一致。

本次直接收口到统一的“固有默认项”方案，不再只处理生命周期服务。

## 2. 目标

- 所有产品物模型都固定包含默认属性 `ip`。
- 所有产品物模型都固定包含固有服务 `online`、`offline`、`heartbeat`。
- 新建、读取、保存、导入统一走同一套归一化逻辑。
- 前端物模型抽屉中，固有属性和固有服务都可见但不可编辑、复制、删除或拖拽。

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

### 3.2 固有服务

平台继续保留三个生命周期服务：

- `online`
- `offline`
- `heartbeat`

它们仍然放在 `services` 数组首部，且固定为系统定义。

## 4. 实现方案

### 4.1 后端统一补齐

新增统一组件 `ThingModelBuiltinDefinitionSupport`，负责物模型固有默认项归一化：

- `createDefaultThingModel()`：生成带默认属性和固有服务的默认物模型。
- `ensureBuiltinDefinitions(ObjectNode)`：对任意物模型补齐默认属性与固有服务。

归一化规则：

1. `properties/events/services` 缺失时自动补成数组。
2. `ip` 始终按平台定义重建，不接受用户自定义同名属性覆盖。
3. `online/offline/heartbeat` 始终按平台定义重建，不接受用户自定义同名服务覆盖。
4. 自定义属性排在 `ip` 之后，自定义服务排在三个固有服务之后。

### 4.2 接入链路

以下链路统一接入 `ThingModelBuiltinDefinitionSupport`：

- `ProductService#createProduct`
- `ProductService#getThingModel`
- `ProductService#updateThingModel`
- `ThingModelImportService#executeImportAsync`
- `ThingModelImportService#downloadAndParseExcel`

这样可以保证：

- 新建产品默认就带 `ip`
- 旧产品读取时自动补齐 `ip`
- 手工保存 JSON 时自动补齐 `ip`
- Excel/JSON 导入完成后最终落库版本仍然包含 `ip`

### 4.3 前端交互约束

`ProductThingModelDrawer` 同步升级为“固有默认项”模式：

- 默认物模型 JSON 中直接包含 `ip`
- 解析和格式化 JSON 时自动补齐 `ip` 与固有服务
- `ip` 在属性列表中展示为“固有属性”
- `ip` 不允许编辑、复制、删除、拖拽
- 生命周期服务继续展示为“固有服务”，交互限制保持不变

## 5. 风险与取舍

- 本次不做兼容旧口径的双轨逻辑，统一以平台默认项定义为准。
- 历史库中已有产品不会立即批量回写；但一旦读取、保存或导入物模型，就会自动回到新口径。
- 如果历史数据里曾手工维护过同名 `ip` 属性，其定义会被平台默认定义替换；这是本次统一口径的预期行为。

## 6. 影响范围

- `firefly-device/src/main/java/com/songhg/firefly.iot.device.service.ProductService`
- `firefly-device/src/main/java/com/songhg.firefly.iot.device.service.ThingModelImportService`
- `firefly-device/src/main/java/com/songhg.firefly.iot.device.service.ThingModelBuiltinDefinitionSupport`
- `firefly-device/src/test/java/com/songhg.firefly.iot.device.service.ProductServiceTest`
- `firefly-web/src/pages/product/ProductThingModelDrawer.tsx`
