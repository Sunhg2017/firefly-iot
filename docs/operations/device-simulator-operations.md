# 设备模拟器运维说明

## 1. 构建

```bash
cd firefly-simulator
npm run build:vite
```

## 2. 发布前检查

1. 当前环境登录、环境切换、登录态缓存正常。
2. Video 模式 IPC 已拆分为 `DEVICE` 资产同步和 `MEDIA` 控制两组。
3. 本地状态字段已统一为 `platformDeviceId`。

## 3. 联调检查

### 3.1 GB28181

1. 创建设备后先同步设备资产。
2. SIP 注册成功后执行 Keepalive。
3. 目录查询、设备信息查询能收到响应。
4. 错误密码时能看到明确认证失败原因。

### 3.2 RTSP / RTMP

1. 填写完整 `sourceUrl`。
2. 首次连接创建平台设备资产。
3. 再次连接优先复用同一 `platformDeviceId`。

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
