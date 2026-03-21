# 设备模拟器 AppKey 物模型拉取设计

## 1. 背景

设备模拟器原先通过旧的 connector 内部接口按 `productKey` 拉取物模型：

- 路径为 `/api/v1/protocol/products/thing-model`
- 不带 `X-App-Key`、`X-Timestamp`、`X-Nonce`、`X-Signature`
- 直接依赖旧的协议侧读接口

这条链路已经不符合当前租户侧 OpenAPI 规范。物模型读取需要统一收口到网关 OpenAPI 路径，并使用 AppKey 签名。

## 2. 目标

- 模拟器物模型拉取改为通过 `/open/DEVICE/api/v1/products/thing-model/by-product-key`
- 请求签名规则与网关 AppKey 校验规则保持一致
- 签名计算放在 Electron 主进程，渲染进程不处理 HMAC 细节
- 新建设备和已存在设备都能补录 OpenAPI 配置
- 删除旧的无签名物模型拉取实现，不保留双轨

## 3. 范围

本次变更涉及：

- `firefly-simulator/electron/main.ts`
- `firefly-simulator/electron/preload.ts`
- `firefly-simulator/src/vite-env.d.ts`
- `firefly-simulator/src/store.ts`
- `firefly-simulator/src/components/AddDeviceModal.tsx`
- `firefly-simulator/src/components/DeviceControlPanel.tsx`
- `firefly-simulator/src/components/DeviceListPanel.tsx`

本次不涉及：

- 平台 OpenAPI 签名规则变更
- 网关路由变更
- 设备接入鉴权链路变更
- 数据库结构或 Flyway 变更

## 4. 设计说明

### 4.1 配置模型

模拟器设备新增以下字段：

- `openApiBaseUrl`：OpenAPI 网关地址，默认 `http://localhost:8080`
- `openApiAccessKey`：AppKey 的 Access Key
- `openApiSecretKey`：AppKey 的 Secret Key

字段跟随设备配置一起持久化、克隆、导入、导出。

### 4.2 请求链路

渲染进程只提交以下参数到主进程：

- `baseUrl`
- `productKey`
- `accessKey`
- `secretKey`

主进程负责：

1. 生成 `timestamp` 与 `nonce`
2. 计算空请求体的 `SHA-256`
3. 生成 RFC3986 编码后的 `canonicalQuery`
4. 拼接 Canonical Request
5. 使用 `secretKey` 计算 `HMAC-SHA256`
6. 调用网关 OpenAPI 路径

## 5. Canonical Request

物模型查询固定使用：

- `HTTP_METHOD`：`GET`
- `SERVICE_CODE`：`DEVICE`
- `REQUEST_PATH`：`/api/v1/products/thing-model/by-product-key`
- `CANONICAL_QUERY`：`productKey=...`
- `BODY_SHA256`：空字符串的 `SHA-256`

拼接格式：

```text
GET
DEVICE
/api/v1/products/thing-model/by-product-key
productKey=pk_xxx
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
1742529600000
4f6d8c0e0b7c4b5ca9e8f5a1d2c3b4e5
```

## 6. 页面交互

### 6.1 新建设备

在“扩展配置”区增加物模型 OpenAPI 配置：

- OpenAPI 网关地址
- Access Key
- Secret Key

### 6.2 现有设备

在右侧控制区增加“物模型 OpenAPI”卡片，支持直接编辑当前设备配置。这样旧设备不需要删除重建。

### 6.3 错误提示

物模型拉取前按以下顺序校验：

1. `ProductKey`
2. OpenAPI 网关地址
3. Access Key
4. Secret Key

任一缺失时，停止请求并在界面给出明确提示。

## 7. 关键取舍

- 不再复用旧的 `/api/v1/protocol/products/thing-model`，直接删除旧链路，避免继续维护双轨
- Access Key / Secret Key 仍保存在本地设备配置中，因为模拟器本身就是本地联调工具
- 没有新增全局设置页，本次先收口到设备级配置与控制区补录，保证改动可落地

## 8. 风险与边界

- 如果租户未创建并授权对应 AppKey，物模型模拟不可用，但自定义 JSON 上报仍可继续
- 如果网关地址填写为 connector 地址，签名请求会失败，界面会反馈最近一次同步错误
- 旧本地设备配置不会自动补出 Access Key / Secret Key，需要用户在控制区补录
