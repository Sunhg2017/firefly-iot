# Firefly-IoT 设备模拟器详细设计

> 版本: v2.0.0
> 日期: 2026-03-28
> 状态: Done

## 1. 目标

- 模拟器继续覆盖 HTTP、MQTT、CoAP、Video、SNMP、Modbus、WebSocket、TCP、UDP、LoRaWAN。
- Video 模式对齐平台最新视频资产链路。
- 视频设备同步统一走 `DEVICE`，媒体控制统一走 `MEDIA`。
- 设备列表支持直接编辑已有模拟设备，编辑和新建统一复用同一个抽屉表单。

## 2. Video 模式设计

### 2.1 平台标识

本地状态中的平台视频标识统一命名为 `platformDeviceId`，表示平台 `devices.id`。

### 2.2 连接流程

1. 读取当前环境登录态。
2. 调用 `DEVICE` 路由查询同一视频身份是否已存在。
3. 若已存在，则更新设备资产。
4. 若不存在，则创建设备资产。
5. 缓存 `platformDeviceId`。
6. 若当前模式为 `GB28181`，连接阶段立即启动本地 SIP 客户端、发送 `REGISTER`，并把心跳请求挂起到注册成功后自动发送。
7. 后续播放、截图、录像、目录、设备信息、PTZ 全部按 `platformDeviceId` 调 `MEDIA`。

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

### 2.5 Video 状态口径

- `GB28181` 设备状态卡显示 `SIP 注册`、`SIP 心跳`。
- `RTSP / RTMP` 设备状态卡显示 `平台同步`、`连接状态`。
- 不再复用通用设备的 `认证状态`、`自动上报` 口径展示 Video 状态。

### 2.6 本地摄像头与码流发送

- 新增 `videoSourceType`：
  - `LOCAL_CAMERA`
  - `REMOTE_SOURCE`
- `GB28181` 默认 `LOCAL_CAMERA`，收到 INVITE 后自动按 SDP 目标地址发送本地 RTP 码流。
- `RTSP / RTMP` 选择 `LOCAL_CAMERA` 时，模拟器自动按当前环境的 `mediaHost/mediaRtspPort/mediaRtmpPort` 生成 `sourceUrl`，并在开始推流前先启动本地摄像头推流进程。
- 新建设备时可直接选择本机摄像头设备；macOS 下会同步枚举当前摄像头可用采集模式并保存到设备配置。
- Electron 主进程负责拉起并托管本地推流子进程，断开、停流、注销时统一回收。
- macOS 摄像头采集默认先使用显式 `framerate + video_size`；若 `avfoundation` 返回参数不支持，会先根据本次失败日志里的实际被拒绝模式，从 `Supported modes` 中顺序尝试兼容分辨率与帧率。
- 若失败日志同时给出 `Supported pixel formats`，会继续按兼容像素格式重试输入侧 `pixel_format`，避免 `avfoundation` 默认 `yuv420p` 与摄像头驱动能力不匹配。
- 已确认的 `avfoundation` 兼容性输出按告警展示；真正导致起流失败的 stderr 才按错误返回。
- 最后仍失败时，才降级到设备默认采集模式，避免因机型差异导致启动失败。

### 2.7 环境级媒体地址

- 模拟器环境除 `gatewayBaseUrl/protocolBaseUrl/mqttBrokerUrl` 外，补充维护 `mediaHost`、`mediaRtspPort`、`mediaRtmpPort`。
- `RTSP / RTMP` 本地摄像头模式不再从平台网关地址反推 `localhost:554/1935`，统一以环境里显式配置的 ZLM 可达地址生成推流目标。
- 当前开发默认值对齐共享 ZLM：`192.168.123.102 / 18554 / 1935`。
- 本地摄像头 stderr 统一按“本地码流提示/异常”展示，不再误标成 SIP 异常。

## 3. GB28181 SIP 模拟

- 保留本地 SIP 客户端能力
- REGISTER 使用设备级 SIP 密码参与 Digest 认证（强制，禁止无密码注册）
- 点击 `连接` 后自动启动 SIP、发送 REGISTER，并在注册成功后自动开始 Keepalive
- Keepalive、Catalog、DeviceInfo、INVITE、BYE、PTZ 响应逻辑保持不变
- INVITE 时会从 SDP 解析目标 `ip/port/ssrc`，并驱动本地摄像头 RTP 发送

## 4. 设计取舍

- 不为旧 `videoDeviceId`、旧 `/MEDIA` 主数据接口保留双轨兼容。
- 不增加模拟器私有主数据接口，直接复用平台 `device` 与 `media` 正式接口。
- 编辑已连接设备时，先断开当前连接再保存新配置，不做“热更新配置但连接仍沿用旧参数”的不一致实现。
- Video 设备编辑后若身份键发生变化，会同步清空旧 `platformDeviceId`，确保下一次连接重新按新身份查重和绑定平台资产。

## 5. 设备编辑

### 5.1 入口

- 左侧设备卡片增加 `编辑` 动作。
- 点击后打开与“新建”共用的分步抽屉，并回填当前设备配置。

### 5.2 保存规则

1. 表单只更新可持久化配置字段。
2. `status`、`token`、`streamUrl`、`sipRegistered`、`sipKeepaliveEnabled` 等运行态字段不允许直接由表单覆盖。
3. 若设备当前不是离线态，保存前先执行断开连接，保存完成后由用户按新配置重新连接。

### 5.3 详情参数编辑

- `GB28181` 在线设备的 `SIP 参数` 弹窗补齐本地采集参数：
  - `cameraDevice`
  - `mediaWidth`
  - `mediaHeight`
  - `mediaFps`
- `RTSP / RTMP` 使用本地摄像头时，流控制区补充 `采集参数` 入口。
- Electron 主进程新增 `sip:updateMediaConfig`，保证详情页改动的采集参数能同步刷新到运行中的 SIP 本地媒体配置。

### 5.4 导入导出一致性

- Video 设备导入导出补齐以下本地采集字段：
  - `cameraDevice`
  - `mediaFps`
  - `mediaWidth`
  - `mediaHeight`
