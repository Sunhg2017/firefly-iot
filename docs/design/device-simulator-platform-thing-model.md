# 设备模拟器平台登录态物模型同步设计

## 1. 背景

设备模拟器此前通过设备级 OpenAPI 配置拉取物模型，要求每台模拟设备单独维护网关地址、Access Key、Secret Key。该方案存在三个问题：

- 配置分散，新增或切换环境时需要重复录入。
- 与当前模拟器“环境 + 登录态”工作方式割裂，操作成本高。
- 物模型读取链路和平台租户视角不一致，难以保证当前租户看到的就是平台最新物模型。

本次改造将物模型同步收口到当前环境的平台官网接口，统一复用当前环境登录态。

## 2. 目标

- 设备模拟器按当前环境 `gatewayBaseUrl + Bearer Token` 获取物模型。
- 物模型同步只依赖 `ProductKey` 与当前环境登录态，不再维护设备级 AK/SK。
- 新建设备抽屉、设备详情、导入导出和本地持久化一并删除旧的 OpenAPI 字段。
- 设备主信息区取消吸顶，主工作区滚动时保持普通文档流布局。

## 3. 范围

涉及文件：

- `firefly-simulator/electron/main.ts`
- `firefly-simulator/electron/preload.ts`
- `firefly-simulator/src/vite-env.d.ts`
- `firefly-simulator/src/store.ts`
- `firefly-simulator/src/workspaceStore.ts`
- `firefly-simulator/src/components/DeviceControlPanel.tsx`
- `firefly-simulator/src/components/AddDeviceModal.tsx`
- `firefly-simulator/src/components/DeviceListPanel.tsx`

不涉及：

- 平台 `firefly-device` 物模型接口定义变更
- 数据库结构或 Flyway 变更
- 设备接入鉴权链路变更

## 4. 方案

### 4.1 调用链路

模拟器通过 Electron IPC 暴露登录态接口：

- `simulator:productThingModel`

实际请求目标为：

- `GET /DEVICE/api/v1/products/thing-model/by-product-key?productKey=...`

请求头统一使用当前环境登录态：

- `Authorization: Bearer <accessToken>`
- `X-Platform: WEB`
- `User-Agent: Firefly-Simulator/1.0` 或渲染进程透传值

### 4.2 前端行为

- `DeviceControlPanel` 在设备协议为 `HTTP / MQTT / CoAP / Video` 时自动尝试同步物模型。
- 同步前校验 `ProductKey` 与当前环境登录态。
- 登录失效时清理当前环境 session，并提示重新登录。
- 卡片标题改为“平台物模型”，提供手动刷新按钮。
- 设备基础信息卡去掉 `sticky`，恢复普通滚动布局。
- Video 新建设备抽屉第二步补齐产品选择 / `ProductKey`，不再与其他协议完全割裂。
- Video 设备仍保留自己的协议专属工具区，但物模型同步入口收口到与其他协议同一张“平台物模型”卡片。

### 4.3 状态收口

删除以下设备级字段：

- `openApiBaseUrl`
- `openApiAccessKey`
- `openApiSecretKey`

对应影响：

- 新建设备抽屉不再展示 AK/SK 输入项。
- 设备列表导入导出不再携带旧字段。
- 本地持久化新设备默认值不再生成旧字段。

## 5. 关键取舍

- 物模型读取改为依赖当前环境登录态，这是为了保证模拟器看到的是当前租户在平台上的最新物模型口径。
- 旧的设备级 AK/SK 配置不保留兜底分支，避免继续维护双轨。
- 当平台不可达或未登录时，只影响物模型候选项同步，不影响自定义 JSON 上报。
- Video 模式切换后直接清空旧 `ProductKey`，强制重新选择匹配当前模式的产品，避免继续保留错误协议组合。

## 6. 风险与边界

- 当前环境未登录时，物模型无法同步，只能使用自定义 JSON。
- Video 设备当前只接入“产品选择 + ProductKey 同步物模型”这条链路，尚未把视频运行时事件统一写回设备数据服务。
- 当前环境切换后，物模型会按新环境租户重新拉取，可能与旧环境结果不同，这是预期行为。
- 旧本地缓存里如果仍带有 `openApi*` 字段，新版本会忽略这些字段；建议通过重新导出配置覆盖旧文件。
