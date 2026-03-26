# Firefly-IoT 设备模拟器详细设计

> 版本: v2.0.0
> 日期: 2026-03-27
> 状态: Done

## 1. 目标

- 模拟器继续覆盖 HTTP、MQTT、CoAP、Video、SNMP、Modbus、WebSocket、TCP、UDP、LoRaWAN。
- Video 模式对齐平台最新视频资产链路。
- 视频设备同步统一走 `DEVICE`，媒体控制统一走 `MEDIA`。

## 2. Video 模式设计

### 2.1 平台标识

本地状态中的平台视频标识统一命名为 `platformDeviceId`，表示平台 `devices.id`。

### 2.2 连接流程

1. 读取当前环境登录态。
2. 调用 `DEVICE` 路由查询同一视频身份是否已存在。
3. 若已存在，则更新设备资产。
4. 若不存在，则创建设备资产。
5. 缓存 `platformDeviceId`。
6. 后续播放、截图、录像、目录、设备信息、PTZ 全部按 `platformDeviceId` 调 `MEDIA`。

### 2.3 唯一标识

- `GB28181`: `gbDeviceId`
- `RTSP / RTMP`: 完整 `sourceUrl`

### 2.4 IPC 拆分

设备资产 IPC：

- `deviceVideoCreate`
- `deviceVideoList`
- `deviceVideoGet`
- `deviceVideoUpdate`
- `deviceVideoDelete`
- `deviceVideoChannels`

媒体控制 IPC：

- `videoControlStartStream`
- `videoControlStopStream`
- `videoControlPtz`
- `videoControlSnapshot`
- `videoControlCatalog`
- `videoControlDeviceInfo`
- `videoControlStartRecording`
- `videoControlStopRecording`

## 3. GB28181 SIP 模拟

- 保留本地 SIP 客户端能力
- REGISTER 使用设备级 SIP 密码参与 Digest 认证
- Keepalive、Catalog、DeviceInfo、INVITE、BYE、PTZ 响应逻辑保持不变

## 4. 设计取舍

- 不为旧 `videoDeviceId`、旧 `/MEDIA` 主数据接口保留双轨兼容。
- 不增加模拟器私有主数据接口，直接复用平台 `device` 与 `media` 正式接口。
