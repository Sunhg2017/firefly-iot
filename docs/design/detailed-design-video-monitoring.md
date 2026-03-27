# Firefly-IoT 视频设备并入 Device 详细设计

> 版本: v2.0.0
> 日期: 2026-03-27
> 状态: Done

## 1. 背景

旧实现把视频设备主数据拆在 `firefly-media` 的独立视频链路里，导致产品、设备资产、视频控制、设备模拟器之间存在四类割裂：

- 视频设备不走统一的 `产品 -> 设备资产` 主链路。
- Web 端存在独立 `/video` 页面和菜单，和 `/device` 视图割裂。
- `firefly-media` 同时承担设备主数据和媒体运行态，边界不清。
- 设备模拟器只能通过 `MEDIA` 直接建视频设备，无法复用平台已有设备资产。

本次重构直接收口到最终实现，不保留旧页面、旧菜单、旧主数据接口，也不做旧数据迁移。

## 2. 目标

- 视频设备主数据统一归 `firefly-device` 管理。
- `firefly-media` 只保留协议、流会话和运行态控制。
- Web 端把视频设备视图并入 `/device`。
- 产品页摄像头接入统一跳到 `/device?assetType=video`。
- 模拟器先同步设备资产，再按 `deviceId` 执行媒体控制。

## 3. 模块边界

### 3.1 firefly-device

负责：

- 视频设备资产创建、查询、更新、删除
- 视频通道资产持久化
- 视频运行态事件回写
- 对 `firefly-media` 暴露内部查询接口

不负责：

- SIP 会话
- ZLMediaKit 控制
- 实时流播放、截图、录像

### 3.2 firefly-media

负责：

- GB28181 SIP 注册、消息处理、目录查询、设备信息查询
- ZLMediaKit 推流、停流、截图、录像
- 运行态表 `stream_sessions`
- 通过 MQ 回写设备在线状态、通道目录、设备信息

不负责：

- 视频设备主数据 CRUD
- 视频通道主数据 CRUD

## 4. 数据模型

视频设备资产采用三张表：

- `devices`
  - 平台统一设备资产主表
- `device_video_profiles`
  - 视频专属档案，`device_id` 唯一
- `device_video_channels`
  - 视频通道档案，按 `device_id + channel_id` 管理

### 4.1 device_video_profiles 关键字段

- `device_id`
- `tenant_id`
- `stream_mode`
- `gb_device_id`
- `gb_domain`
- `sip_password`
- `transport`
- `ip`
- `port`
- `source_url`
- `manufacturer`
- `model`
- `firmware`
- `status`
- `last_registered_at`

### 4.2 唯一约束

- `GB28181`: `tenant_id + gb_device_id`
- `RTSP / RTMP`: `tenant_id + stream_mode + source_url`

旧的 `video_devices`、`video_channels` 不再承担主数据职责。

## 5. 对外接口

### 5.1 设备资产接口

由 `firefly-device` 提供：

- `POST /api/v1/devices/video`
- `POST /api/v1/devices/video/list`
- `GET /api/v1/devices/video/{deviceId}`
- `PUT /api/v1/devices/video/{deviceId}`
- `DELETE /api/v1/devices/video/{deviceId}`
- `GET /api/v1/devices/video/{deviceId}/channels`

视频字段不再塞入通用 `DeviceCreateDTO`，而是固定使用视频子资源接口。

### 5.2 内部接口

由 `firefly-device` 提供给 `firefly-media`：

- 按 `deviceId` 查询视频档案
- 按 `deviceId` 查询视频通道
- 按 `gbDeviceId + gbDomain` 查询视频档案和设备级 SIP 密码

### 5.3 媒体控制接口

由 `firefly-media` 对外保留：

- `POST /api/v1/video/devices/{deviceId}/catalog`
- `POST /api/v1/video/devices/{deviceId}/device-info`
- `POST /api/v1/video/devices/{deviceId}/start`
- `POST /api/v1/video/devices/{deviceId}/stop`
- `POST /api/v1/video/devices/{deviceId}/ptz`
- `POST /api/v1/video/devices/{deviceId}/snapshot`
- `POST /api/v1/video/devices/{deviceId}/record/start`
- `POST /api/v1/video/devices/{deviceId}/record/stop`

`firefly-media` 已删除视频设备和通道主数据 CRUD。

## 6. 关键流程

### 6.1 创建视频设备

1. Web 端在 `/device` 的视频设备视图打开抽屉。
2. 调用 `POST /api/v1/devices/video` 创建视频资产。
3. `firefly-device` 先校验产品协议和视频唯一键。
4. 平台创建 `devices` 主记录。
5. 平台创建 `device_video_profiles` 记录。
6. 返回统一的 `deviceId` 作为视频设备平台标识。

### 6.2 GB28181 注册认证

1. 设备向 `firefly-media` 发起 REGISTER。
2. `SipRegisterAuthService` 通过内部接口按 `gbDeviceId + gbDomain` 查询视频档案。
3. 平台读取设备级 `sip_password` 校验 Digest；GB28181 设备不再允许无密码注册。
4. 成功后只更新运行态并发 MQ 事件。
5. `firefly-device` 消费事件并更新 `device_video_profiles.status` 与 `devices.online_status`。

认证失败原因必须原样返回，不允许吞异常。

### 6.3 运行态回写

`firefly-media -> Kafka -> firefly-device`

事件主题：

- `video.device.status.changed`
- `video.channels.synced`
- `video.device.info.synced`

上下文要求：

- 复用现有 Kafka 鉴权与 tracing 透传
- 消费端逐条恢复并清理租户、用户、权限上下文

### 6.4 播放地址与开流时序

- `firefly-media` 调用 ZLM REST 时优先使用 `zlmediakit.api-host/api-port`；未显式配置时才回落到 `zlmediakit.host/port`。
- `zlmediakit.api-host/api-port` 只用于媒体服务访问 ZLM REST，可配置为容器服务名。
- `zlmediakit.host/port` 必须保持为摄像头、浏览器和需要直连 RTSP 的组件可访问地址，禁止误配到 `firefly-gateway` 或其他只返回业务包装结果的 HTTP 服务。
- 对前端下发播放地址时，固定使用 `zlmediakit.public-host/public-port/public-scheme` 作为基准地址。
- 若未配置 `public-host`，默认回落到 `host`，仅适用于本机联调。
- `compose` 部署默认内置 `zlmediakit` 基础设施，HTTP API 暴露为宿主机 `18080`，RTSP 暴露为宿主机 `18554`。
- `RTSP / RTMP` 代理流继续使用 `live/{streamId}` 作为 ZLM 应用名和播放地址。
- `GB28181` 开流前必须先调用 ZLM `openRtpServer` 打开 RTP 收流端口，并显式绑定自定义 `streamId`。
- `compose` 示例为保证宿主机端口可达，默认使用固定 `zlmediakit.rtp-port` 打开 RTP 收流口，并要求宿主机同步暴露该端口。
- `openRtpServer` 的端口返回值需兼容 ZLM 不同版本的顶层 `port` 与 `data.port` 两种结构，并允许字符串端口。
- `GB28181` 收流后的 ZLM 应用名固定为 `rtp`，因此短轮询、播放地址、截图和录制都必须按 `rtp/{streamId}` 处理，不能继续复用 `live/{streamId}`。
- `startStream` 在返回播放地址前会短轮询 ZLM `getMediaList`，确认流已出现，避免“刚返回地址就播放失败”。

### 6.5 PTZ 请求解码

- PTZ 请求 `command` 同时支持数字值和枚举名字符串。
- 请求体反序列化失败时返回 `400`，不再落入通用 `500`。

## 7. Web 端设计

- 删除独立 `/video` 路由和菜单。
- `/device` 下新增视频设备视图页签。
- 首次进入自动查询，后续查询仅在点击 `查询` 按钮后触发。
- 产品页摄像头接入跳转到 `/device?assetType=video&productKey=...&protocol=...&autoCreate=1`。
- 视频新增、编辑、通道查看、媒体控制统一使用视频专用抽屉。

## 8. 设备模拟器设计

- 本地平台资产标识统一改为 `platformDeviceId`。
- 连接 Video 设备时：
  1. 先通过 `DEVICE` 路由调用 `/api/v1/devices/video*`
  2. 查重后创建或更新设备资产
  3. 缓存 `platformDeviceId`
  4. 再通过 `MEDIA` 路由按 `platformDeviceId` 执行播放、PTZ、截图、录制、目录和设备信息查询
- GB28181 本地 SIP 模拟仍使用设备级 SIP 密码参与 Digest 认证。

## 9. 风险与约束

- 不处理旧 `video_devices / video_channels` 数据迁移；历史脏数据由运维清理。
- 旧 `/video` 菜单、旧页面、旧前端 API 不再保留兼容分支。
- 角色权限中，视频资产管理统一依赖 `device:create/read/update/delete`；视频控制依赖 `video:read/stream/ptz/record`。
