# 设备模拟器运维说明

## 1. 构建

```bash
cd firefly-simulator
npm run build:vite
```

说明：

- 模拟器通过 `@ffmpeg-installer/ffmpeg` 内置本地推流运行时，不需要额外手工安装 ffmpeg。

## 2. 发布前检查

1. 当前环境登录、环境切换、登录态缓存正常。
2. Video 模式 IPC 已拆分为 `DEVICE` 资产同步和 `MEDIA` 控制两组。
3. 本地状态字段已统一为 `platformDeviceId`。
4. Video 顶部状态卡口径正确：
   - `GB28181` 显示 `SIP 注册`、`SIP 心跳`
   - `RTSP / RTMP` 显示 `平台同步`、`连接状态`

## 3. 联调检查

### 3.1 GB28181

1. 创建设备后先同步设备资产。
2. 设备级 `SIP 密码` 必须已配置，否则注册会被平台拒绝。
3. SIP 注册成功后执行 Keepalive。
4. 点击开始推流后，收到 INVITE 时会自动启动本地摄像头码流发送。
5. 目录查询、设备信息查询能收到响应。
6. 错误密码时能看到明确认证失败原因。

### 3.2 RTSP / RTMP

1. 选择媒体源为 `本地摄像头` 时，系统自动生成 `sourceUrl` 并回填平台资产。
2. 选择媒体源为 `外部源地址` 时，需要填写完整 `sourceUrl`。
3. 首次连接创建平台设备资产。
4. 再次连接优先复用同一 `platformDeviceId`。

## 4. 常见问题

### 4.1 Video 设备提示未登录当前环境

先检查左上角环境是否已登录，再检查网关是否能访问 `DEVICE` 和 `MEDIA` 两类路由。

### 4.2 连接成功但重复创建设备

排查：

1. 检查模拟器版本是否已使用 `platformDeviceId`
2. 检查是否先走了 `deviceVideoList`
3. 检查平台唯一键约束是否最新

### 4.3 设备资产同步成功但媒体控制失败

排查：

1. 检查 `MEDIA` 路由是否可达
2. 检查 `platformDeviceId` 是否已回填
3. 检查 `firefly-media` 是否已部署到控制型视频接口版本

### 4.4 GB28181 已注册但播放超时/网络错误

排查：

1. 检查日志中是否出现 `本地码流启动失败`
2. 检查模拟器摄像头权限是否已授权
3. 检查 SIP INVITE 日志是否携带正确的 RTP 目标 `ip:port`
4. 检查媒体服务是否可达并已开放接收端口

### 4.5 RTSP / RTMP 本地摄像头推流失败

排查：

1. 检查平台资产里的 `sourceUrl` 是否为自动生成地址
2. 检查 `开始推流` 时是否出现 `本地摄像头推流已启动` 日志
3. 检查媒体服务是否可达自动生成地址中的主机和端口

### 4.6 模拟器启动时报 ffmpeg 运行时缺失

排查：

1. 在 `firefly-simulator` 目录执行 `npm i`，确认 `@ffmpeg-installer/ffmpeg` 及当前平台子包已安装。
2. 执行 `npm run build:vite`，确认 Electron 主进程打包成功。
3. 如仍报错，设置环境变量 `FFMPEG_PATH` 指向本机可执行 ffmpeg 文件后再启动模拟器。
