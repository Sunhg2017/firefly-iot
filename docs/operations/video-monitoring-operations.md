# 视频设备并入 Device 运维说明

## 1. 适用范围

本文适用于以下模块发布与排查：

- `firefly-device`
- `firefly-media`
- `firefly-web`
- `firefly-simulator`
- `firefly-system`

## 2. 发布顺序

1. 执行 `firefly-device` 最新 Flyway
2. 执行 `firefly-media` 最新 Flyway
3. 执行 `firefly-system` 最新 Flyway
4. 发布 `firefly-device`
5. 发布 `firefly-media`
6. 发布 `firefly-web`
7. 发布 `firefly-simulator`

## 3. 必做检查

### 3.1 数据库

- `firefly-device`
  - 已执行 `V24__init_device_video_assets.sql`
- `firefly-media`
  - 已执行 `V6__refactor_video_runtime_schema.sql`
- `firefly-system`
  - 已执行 `V35__converge_video_permissions_to_device_menu.sql`

### 3.2 服务编译

```bash
mvn -pl firefly-device,firefly-media,firefly-system -am -DskipTests compile
cd firefly-web && npm run build
cd ../firefly-simulator && npm run build:vite
```

### 3.3 路由与菜单

- 前端不再存在独立 `/video` 路由
- 租户空间不再存在独立 `video` 菜单
- 视频视图收口在 `/device`

## 4. 运行前检查

1. `firefly-device`、`firefly-media`、网关、Kafka、ZLMediaKit 已启动。
2. 摄像头产品协议为 `GB28181 / RTSP / RTMP`。
3. `firefly-media -> firefly-device` 内部接口可用。
4. Kafka 鉴权和 tracing 上下文透传已启用。
5. 历史环境如残留旧 `video` 菜单、自定义菜单或重复视频设备，先清理旧数据后再联调。
6. `firefly-media` 已正确配置 `spring.kafka.bootstrap-servers`；开发环境默认对齐 `192.168.123.102:9092`，生产环境通过 `SPRING_KAFKA_BOOTSTRAP_SERVERS` 注入。
7. `deploy/docker-compose.yml` 与 `deploy/docker-compose.prod.yml` 已内置 `zlmediakit`；若未通过脚本启动基础设施，必须手工补齐同等 ZLM 服务。
8. `firefly-media` 的 `zlmediakit.api-host/api-port` 必须直连 ZLM REST；容器化部署可写成 `zlmediakit:80`，禁止继续误指向网关 `8080`。
9. `firefly-media` 的 `zlmediakit.host/port`、`zlmediakit.rtsp-port` 必须是摄像头和平台都可访问的媒体地址；默认 compose 对宿主机暴露 `18080/18554`。
10. `firefly-media` 的 `zlmediakit.public-host/public-port/public-scheme` 已配置为浏览器可访问地址，禁止保留 `localhost` 对外下发给前端。
11. `GB28181` 联调时，`firefly-media` 必须能调用 ZLM `openRtpServer/closeRtpServer`，并允许设备向分配的 RTP 端口发流；compose 默认固定暴露 `ZLM_RTP_PORT`。

## 5. 回归验证

1. 从产品页进入摄像头接入，确认跳到 `/device` 并自动打开视频设备抽屉。
2. 新建 `GB28181`、`RTSP`、`RTMP` 视频设备，确认设备资产列表稳定可见。
3. 同一租户下重复创建同一 `gbDeviceId` 或 `sourceUrl`，接口必须直接失败。
4. 模拟器连接同一台视频设备时优先复用 `platformDeviceId`。
5. `GB28181` 正确密码能完成 REGISTER、Keepalive、Catalog、DeviceInfo。
6. 错误密码能看到明确认证失败原因。
7. `GB28181` 点击播放后，`firefly-media` 日志中应先打开 RTP 收流口，再发送 INVITE，并能在 ZLM 中看到 `rtp/{streamId}` 流注册。
8. 视频上线/离线、目录、设备信息事件能正常回写到 `firefly-device`。

## 6. 常见问题

### 6.1 产品页点摄像头接入后没有跳到 `/device`

排查：

1. 检查前端版本是否包含 `ProductList.tsx` 最新跳转逻辑。
2. 检查路由是否仍残留旧 `/video` 配置。
3. 检查 URL 是否带 `assetType=video` 和 `autoCreate=1`。

### 6.2 视频设备保存成功后列表看不到

排查：

1. 检查 `devices` 与 `device_video_profiles` 是否都已写入。
2. 检查 `device_video_profiles.device_id` 是否正确关联。
3. 检查当前账号是否有对应项目、分组数据权限。
4. 检查列表接口是否走 `/api/v1/devices/video/list`。

### 6.3 GB28181 注册提示认证失败

排查：

1. 检查设备资产里是否已保存设备级 `sip_password`（GB28181 现为强制项）。
2. 检查设备端是否使用 `gbDeviceId` 作为 SIP 用户名。
3. 检查 `gbDomain`、传输方式、平台 SIP 监听地址是否一致。
4. 检查 `SipServer` 返回的失败原因是否已透传。

### 6.4 模拟器连接视频设备后重复创建设备

排查：

1. 检查模拟器是否已升级到 `platformDeviceId` 版本。
2. 检查模拟器设备同步是否走 `DEVICE` 路由。
3. 检查平台唯一约束是否已执行到最新版本。
4. 检查 `GB28181` 的 `gbDeviceId` 或 `RTSP/RTMP` 的 `sourceUrl` 是否一致。

### 6.5 GB28181 已接受 INVITE 但播放仍超时

排查：

1. 检查 `firefly-media` 是否已升级到包含 `openRtpServer` 最新链路的版本。
2. 若日志提示 `ZLMediaKit API 调用失败` 且状态码为 `404`，优先检查 `zlmediakit.api-host/api-port` 是否误指向网关或其他 Spring Boot 服务。
3. 检查 `firefly-media` 日志是否先打印 RTP 收流端口，再发送 INVITE。
4. 若日志提示 `GB28181 RTP 收流端口返回不正确`，优先核对 ZLM `openRtpServer` 实际返回体，确认 `port` 是否位于顶层或 `data.port`，并检查是否被代理层转成字符串。
5. 检查 ZLM `getMediaList` 中是否能看到 `app=rtp`、`stream={streamId}` 的流，而不是只检查 `live` 应用。
6. 若通过 compose 部署，检查 `ZLM_RTP_PORT` 是否已映射到宿主机，并与 `zlmediakit.rtp-port` 保持一致。
7. 检查设备是否已按 INVITE 中分配的 RTP 端口向媒体服务发流。
8. 若是跨机器联调，检查 INVITE SDP 中下发给设备的媒体地址是否可达，禁止误填成对端不可访问的 `localhost`。

### 6.6 视频状态没有回写到设备资产

排查：

1. 检查 Kafka 主题是否收到视频事件。
2. 检查消息头是否带租户、用户、权限上下文。
3. 检查 `DeviceVideoRuntimeConsumer` 是否消费成功。

### 6.7 网页播放提示网络错误

排查：

1. 检查 `zlmediakit.public-host/public-port/public-scheme` 是否配置为浏览器可访问地址。
2. 如果仍是 `localhost`，浏览器会访问客户端本机导致播放失败。
3. 检查 `firefly-media` 返回的 `flvUrl/hlsUrl/webrtcUrl` 是否已使用对外地址。
4. 检查开流后是否已出现对应 `streamId` 的媒体流。

### 6.8 云台控制返回服务内部错误

排查：

1. 检查请求体 `command` 是否为合法 PTZ 指令（支持数字值和枚举名）。
2. 如果参数反序列化失败，接口会返回 `400`，根据返回明细修正请求。
3. 检查设备是否为 `GB28181` 且在线。

## 7. 回滚说明

回滚必须同时回退以下改动：

- `firefly-device` 视频资产模型和接口
- `firefly-media` 控制型视频接口与 MQ 回写
- `firefly-web` `/device` 视频视图
- `firefly-simulator` `platformDeviceId` 和新 IPC
- `firefly-system` `V35`

如果数据库已执行本次迁移且需要回滚，先人工清理新增菜单台账和视频资产表数据，再执行代码回退。
