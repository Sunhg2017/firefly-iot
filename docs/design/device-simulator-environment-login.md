# 设备模拟器环境切换与租户登录设计

> 更新时间：2026-03-22
> 适用范围：`firefly-simulator`

## 1. 背景

设备模拟器此前只有本地静态地址和手工录入 `ProductKey` 的方式：

- 无法按不同联调环境快速切换网关、协议服务、媒体服务和 Broker。
- 新建设备时必须手工记忆并输入当前租户下的产品标识。
- 模拟器没有独立登录态，无法直接复用平台现有租户产品列表接口。

这会让桌面模拟器在多环境、多租户联调时重复输入很多参数，也容易因为填错地址或产品标识导致误判。

## 2. 目标

- 为模拟器增加可持久化的环境管理能力。
- 为每个环境增加独立登录态，登录后直接复用平台现有 `/auth/login` 与 `/products/list`。
- 新建设备时优先按当前环境、当前租户自动加载产品列表，并自动回填认证方式。
- 保留未登录或接口异常时的手工录入路径，避免把模拟器直接卡死在平台在线状态上。

## 3. 范围

本次改动覆盖：

- `firefly-simulator/src/workspaceStore.ts`
- `firefly-simulator/src/storage.ts`
- `firefly-simulator/src/components/DeviceListPanel.tsx`
- `firefly-simulator/src/components/AddDeviceModal.tsx`
- `firefly-simulator/electron/main.ts`
- `firefly-simulator/electron/preload.ts`
- `firefly-simulator/src/vite-env.d.ts`

本次不新增后端接口，不修改后端权限模型。

## 4. 设计方案

### 4.1 工作区模型

新增 `workspaceStore`，独立于设备运行态存储：

- `environments`：环境列表
- `activeEnvironmentId`：当前环境
- `sessions`：按环境隔离的登录会话

每个环境至少包含：

- `name`
- `gatewayBaseUrl`
- `protocolBaseUrl`
- `mediaBaseUrl`
- `mqttBrokerUrl`

设备默认值按环境自动派生：

- `openApiBaseUrl` 取 `gatewayBaseUrl`
- `httpBaseUrl`、`httpRegisterBaseUrl`、`coapBaseUrl`、`mqttRegisterBaseUrl`、`snmpConnectorUrl`、`modbusConnectorUrl`、`wsConnectorUrl` 取 `protocolBaseUrl`
- `wsEndpoint` 由 `protocolBaseUrl` 推导
- `loraWebhookUrl` 由 `protocolBaseUrl` 推导

### 4.2 登录与接口复用

模拟器不新建后端接口，直接复用：

- `POST /SYSTEM/api/v1/auth/login`
- `POST /SYSTEM/api/v1/auth/logout`
- `POST /DEVICE/api/v1/products/list`
- `GET /DEVICE/api/v1/products/{id}/secret`

Electron 主进程统一补齐：

- `X-Platform: WEB`
- `User-Agent: Firefly-Simulator/1.0`
- `Authorization: Bearer <token>`

这样既复用平台鉴权链路，也补齐了模拟器场景下的会话和审计头信息。

### 4.3 新建设备联动

`AddDeviceModal` 保持三步抽屉结构，但新增以下联动：

- 打开抽屉后按当前环境预填所有地址类字段。
- 若当前环境已登录，则按协议查询当前租户产品列表。
- HTTP / MQTT / CoAP 的 `productKey` 字段优先切换为产品下拉选择。
- 选择产品后自动回填：
  - `productKey`
  - `httpAuthMode` 或 `mqttAuthMode`
  - `productSecret`（仅一型一密产品）

未登录、登录失效、接口失败、当前协议无产品时，自动回退为手工填写 `ProductKey`。

## 5. 关键取舍

- 没有把登录态塞进现有 `useSimStore`，避免设备运行态和工作区配置耦合。
- 没有新增模拟器专属后端 API，直接复用 Web 已在使用的网关路径。
- 没有强依赖服务在线；产品查询失败时保留手工录入，保证本地调试流程可继续。

## 6. 风险与边界

- 当前登录态按环境持久化保存，但未引入自动 refresh token 续期，令牌过期后会提示重新登录。
- 产品列表单次最多拉取 200 条，遵循后端分页限制。
- CoAP 场景当前仍保持 `deviceSecret` 录入方式；产品选择主要用于收口 `ProductKey` 和当前租户产品范围。
