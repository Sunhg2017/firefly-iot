# 设备模拟器平台登录态物模型同步运维说明

## 1. 适用范围

本文档用于设备模拟器改为通过当前环境登录态同步物模型后的发布、验证、排障与回滚说明。

## 2. 发布内容

本次发布仅涉及 `firefly-simulator` 桌面端：

- 物模型同步切换到平台 `DEVICE` 服务接口
- 删除设备级 AK/SK 配置
- 去除主界面设备信息吸顶

本次不涉及数据库、Flyway 和菜单权限数据变更。

## 3. 依赖条件

- 当前环境 `gatewayBaseUrl` 可访问平台网关
- 当前环境用户已成功登录，且 token 有效
- 平台 `DEVICE` 服务已提供 `GET /api/v1/products/thing-model/by-product-key`

## 4. 验证步骤

执行构建：

```bash
cd firefly-simulator
npm run build:vite
```

手工回归：

1. 打开模拟器，切换到目标环境并完成登录。
2. 新建 HTTP、MQTT、CoAP 或 Video 模拟设备，确认抽屉中不再出现 AK/SK 配置。
3. 选中设备后填写 `ProductKey`，进入右侧“平台物模型”卡片。
4. 确认可自动同步属性、事件数量，点击“刷新”可再次拉取。
5. 注销当前环境或制造 401 后，再次同步应提示重新登录。
6. 滚动主工作区，设备基本信息不再吸顶。

Video 补充回归：

1. 新建一个 Video 设备。
2. 第二步先选择与当前视频模式匹配的产品，或手工填写 `ProductKey`。
3. 在 `GB28181 / RTSP / RTMP` 之间切换一次，确认旧产品会被清空并要求重新选择。
4. 创建后选中该设备，确认右侧出现“平台物模型”卡片。
5. 确认物模型可按 `ProductKey` 拉取，不再只支持 HTTP / MQTT / CoAP。

## 5. 常见故障

### 5.1 提示“请先登录当前环境”

排查项：

- 当前环境是否已登录
- 当前环境是否切换到了正确租户
- 本地 session 是否已被清理

### 5.2 提示“当前环境登录已失效”

排查项：

- token 是否已过期
- 当前租户权限是否变化
- 是否切换了环境但未重新登录

### 5.3 物模型同步失败

排查项：

- `ProductKey` 是否正确
- Video 模式下，产品协议是否与当前视频模式一致：`GB28181 -> GB28181`，`RTSP -> RTSP`，`RTMP -> RTMP`
- `gatewayBaseUrl` 是否可达
- 平台 `DEVICE` 服务是否正常
- 网关转发 `/DEVICE/api/v1/products/thing-model/by-product-key` 是否正常

## 6. 回滚说明

如需回滚，需同时回滚以下文件：

- `firefly-simulator/electron/main.ts`
- `firefly-simulator/electron/preload.ts`
- `firefly-simulator/src/vite-env.d.ts`
- `firefly-simulator/src/store.ts`
- `firefly-simulator/src/workspaceStore.ts`
- `firefly-simulator/src/components/DeviceControlPanel.tsx`
- `firefly-simulator/src/components/AddDeviceModal.tsx`
- `firefly-simulator/src/components/DeviceListPanel.tsx`

回滚后重新执行：

```bash
cd firefly-simulator
npm run build:vite
```

## 7. 运维提醒

- 旧版本导出的设备配置文件如果仍包含 `openApiBaseUrl / openApiAccessKey / openApiSecretKey`，新版本会忽略这些字段。
- 如需彻底清理历史残留，建议使用新版本重新导出一次设备配置，覆盖旧文件。
