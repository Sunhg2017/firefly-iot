# 设备模拟器 AppKey 物模型拉取运维说明

## 1. 适用范围

本文档用于设备模拟器改为通过 AppKey 签名拉取物模型后的发布、验证、排障与回滚。

## 2. 发布内容

本次发布仅涉及 `firefly-simulator` 前端与 Electron 主进程：

- 新增设备级 OpenAPI 网关、Access Key、Secret Key 配置
- 物模型拉取改走网关 OpenAPI
- 删除旧的无签名物模型拉取链路

本次不涉及：

- 数据库变更
- Flyway 迁移
- 网关或设备服务接口定义变更

## 3. 依赖条件

发布后，物模型模拟依赖以下条件：

- `firefly-gateway` 可访问，默认地址 `http://localhost:8080`
- 租户已订阅 `product.thing-model.by-product-key`
- 租户已创建可用 AppKey，并授权该接口
- 调用方配置了 Access Key 与 Secret Key

## 4. 验证步骤

执行：

```bash
cd firefly-simulator
npm run build:vite
```

手工回归：

1. 新建设备时可以看到 OpenAPI 网关、Access Key、Secret Key 输入项
2. 选中旧设备后，右侧控制区可以补录上述三项
3. 配好 `ProductKey + AppKey` 后，数据上报区可以加载物模型项
4. 清空 Access Key 或 Secret Key 后，界面应阻止物模型请求并提示缺项
5. 导出设备配置后重新导入，OpenAPI 三项配置仍然存在

## 5. 常见排障

### 5.1 物模型始终加载失败

检查顺序：

1. `ProductKey` 是否已填写
2. `openApiBaseUrl` 是否指向网关而不是 connector
3. Access Key / Secret Key 是否来自当前租户有效 AppKey
4. 对应 AppKey 是否授权了 `product.thing-model.by-product-key`
5. 网关是否能访问 `/open/DEVICE/api/v1/products/thing-model/by-product-key`

### 5.2 返回 401

优先检查：

- Secret Key 是否填写错误
- Access Key 是否填写错误
- 本机系统时间是否偏差过大
- AppKey 是否已过期或被停用

### 5.3 返回 403

优先检查：

- 租户是否订阅该 OpenAPI
- AppKey 是否授权该 OpenAPI
- AppKey 是否命中 IP 白名单限制

### 5.4 旧设备没有新配置

这是预期行为。旧设备本地缓存不会自动补全密钥，需要在右侧“物模型 OpenAPI”卡片中手工补录。

## 6. 回滚说明

如需回滚本次改动，需要同时回滚：

- `firefly-simulator/electron/main.ts`
- `firefly-simulator/electron/preload.ts`
- `firefly-simulator/src/vite-env.d.ts`
- `firefly-simulator/src/store.ts`
- `firefly-simulator/src/components/AddDeviceModal.tsx`
- `firefly-simulator/src/components/DeviceControlPanel.tsx`
- `firefly-simulator/src/components/DeviceListPanel.tsx`

回滚后重新执行：

```bash
cd firefly-simulator
npm run build:vite
```

## 7. 运维提醒

- 本次没有保留旧接口兜底，网关 OpenAPI 不可用时，物模型模拟会直接失效
- 但设备连接、动态注册和自定义 JSON 上报不受影响
