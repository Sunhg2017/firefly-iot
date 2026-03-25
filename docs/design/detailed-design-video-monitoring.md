# Firefly-IoT 视频监控模块 — 详细设计文档

> **版本**: v1.0.0  
> **日期**: 2026-02-27  
> **状态**: Draft  
> **关联**: [产品设计文档](./product-design.md) §6.6 视频设备接入与推流

---

## 目录

1. [模块概述](#1-模块概述)
2. [核心概念与术语](#2-核心概念与术语)
3. [数据库设计](#3-数据库设计)
4. [枚举定义](#4-枚举定义)
5. [视频接入流程](#5-视频接入流程)
6. [API 接口设计](#6-api-接口设计)
7. [后端实现](#7-后端实现)
8. [前端交互设计](#8-前端交互设计)
9. [非功能性需求](#9-非功能性需求)

---

## 1. 模块概述

### 1.1 模块定位

视频监控模块负责 **视频设备管理、通道管理、实时播放、云台控制 (PTZ)、截图、录像管理**。通过对接 ZLMediaKit 流媒体引擎，实现 GB/T 28181、RTSP、RTMP 等协议的视频流接入与分发。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| **视频设备管理** | 视频设备 CRUD，支持 GB28181 / RTSP / RTMP 接入方式 |
| **产品联动预填** | 从摄像头产品跳转时自动带入产品上下文并锁定接入协议 |
| **设备资产联动** | 新建视频设备时自动补建设备资产主设备并回填 `video_devices.device_id` |
| **通道管理** | 设备下的视频通道列表，支持多通道 NVR |
| **实时播放** | 发起实时点播，返回 FLV/HLS/WebRTC 播放地址 |
| **云台控制** | PTZ 方向控制、变焦控制 |
| **截图** | 远程截图，存储到 MinIO |
| **录像管理** | 开始/停止录像，录像文件列表查询 |
| **流会话管理** | 跟踪当前活跃的视频流会话 |

### 1.3 架构依赖

```
┌────────────────────────────────┐
│        视频监控模块              │
│                                 │
│  ┌──────────┐  ┌────────────┐  │
│  │ 设备管理  │  │ 流媒体控制  │  │
│  └──────────┘  └────────────┘  │
└──────┬──────────────┬──────────┘
       │              │
  ┌────▼────┐  ┌──────▼──────┐
  │PostgreSQL│  │ ZLMediaKit  │
  └─────────┘  │ (REST API)  │
               └─────────────┘
```

---

## 2. 核心概念与术语

| 术语 | 英文 | 说明 |
|------|------|------|
| **视频设备** | Video Device | IPC 摄像头、NVR、无人机等视频类设备 |
| **通道** | Channel | 一个视频设备可能有多个视频通道（如 NVR 下多路 IPC） |
| **流会话** | Stream Session | 一次视频播放的会话，记录播放地址和状态 |
| **PTZ** | Pan-Tilt-Zoom | 云台控制：水平旋转、垂直旋转、变焦 |
| **ZLMediaKit** | - | C++ 高性能流媒体服务器，支持协议转封装 |

---

## 3. 数据库设计

### 3.1 video_devices 表

```sql
CREATE TABLE video_devices (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
    device_id       BIGINT REFERENCES devices(id),
    name            VARCHAR(256) NOT NULL,
    gb_device_id    VARCHAR(64),
    gb_domain       VARCHAR(64),
    transport       VARCHAR(16) NOT NULL DEFAULT 'UDP',
    sip_password    VARCHAR(128),
    stream_mode     VARCHAR(16) NOT NULL DEFAULT 'GB28181',
    ip              VARCHAR(64),
    port            INT,
    manufacturer    VARCHAR(128),
    model           VARCHAR(128),
    firmware        VARCHAR(64),
    status          VARCHAR(16) NOT NULL DEFAULT 'OFFLINE',
    last_registered_at TIMESTAMPTZ,
    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

说明：

- `video_devices` 通过 `device_id` 关联设备资产主表，视频设备权限与设备资产数据权限保持一致。
- 当前 `video_devices` 仍未单独持久化 `product_id / product_key`；产品归属通过关联的设备资产主设备反查，不再只依赖 URL 参数。

### 3.2 video_channels 表

```sql
CREATE TABLE video_channels (
    id              BIGSERIAL PRIMARY KEY,
    video_device_id BIGINT NOT NULL REFERENCES video_devices(id) ON DELETE CASCADE,
    channel_id      VARCHAR(64) NOT NULL,
    name            VARCHAR(256),
    manufacturer    VARCHAR(128),
    model           VARCHAR(128),
    status          VARCHAR(16) NOT NULL DEFAULT 'OFFLINE',
    ptz_type        INT DEFAULT 0,
    sub_count       INT DEFAULT 0,
    longitude       DOUBLE PRECISION,
    latitude        DOUBLE PRECISION,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.3 stream_sessions 表

```sql
CREATE TABLE stream_sessions (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    video_device_id BIGINT NOT NULL REFERENCES video_devices(id),
    channel_id      VARCHAR(64),
    stream_id       VARCHAR(256),
    status          VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    flv_url         VARCHAR(1024),
    hls_url         VARCHAR(1024),
    webrtc_url      VARCHAR(1024),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    stopped_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 4. 枚举定义

### 4.1 VideoDeviceStatus

```java
ONLINE("ONLINE"), OFFLINE("OFFLINE")
```

### 4.2 StreamMode

```java
GB28181("GB28181"), RTSP("RTSP"), RTMP("RTMP")
```

### 4.3 StreamStatus

```java
ACTIVE("ACTIVE"), CLOSED("CLOSED")
```

### 4.4 PtzCommand

```java
STOP(0), UP(1), DOWN(2), LEFT(3), RIGHT(4), ZOOM_IN(5), ZOOM_OUT(6)
```

---

## 5. 视频接入流程

```
1. 管理员可直接进入 `/video`，或从摄像头产品页跳转进入视频监控
2. 如果来自产品页，前端自动带入 `productKey / productName / protocol` 并打开“添加视频设备”抽屉
3. 管理员选择产品或沿用产品上下文，前端自动锁定与产品一致的接入协议
4. 平台先在设备资产主链路创建设备并回填 `video_devices.device_id`，再保存视频设备记录
5. 若 GB28181 设备启用了 SIP 鉴权，平台以 `GB 设备编号` 为用户名，对 REGISTER 发起 Digest 挑战并校验设备级 `sip_password`
6. REGISTER 校验通过后，平台更新设备状态为 ONLINE
7. 用户请求实时播放 → 平台调用 ZLMediaKit API 发起点播
8. ZLMediaKit 返回播放地址 → 平台保存流会话并返回前端
9. 前端使用 FLV.js / HLS.js 播放视频
10. 用户停止播放 → 平台调用 ZLMediaKit 关闭流 → 更新会话状态
```

---

## 6. API 接口设计

### 6.1 视频设备管理

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/video/devices` | `video:create` | 创建视频设备 |
| POST | `/api/v1/video/devices/list` | `video:read` | 分页查询 |
| GET | `/api/v1/video/devices/{id}` | `video:read` | 查看详情 |
| PUT | `/api/v1/video/devices/{id}` | `video:update` | 更新设备 |
| DELETE | `/api/v1/video/devices/{id}` | `video:delete` | 删除设备 |

### 6.2 通道管理

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/video/devices/{id}/channels` | `video:read` | 获取通道列表 |

### 6.3 流媒体控制

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/video/devices/{id}/start` | `video:stream` | 开始播放 |
| POST | `/api/v1/video/devices/{id}/stop` | `video:stream` | 停止播放 |
| POST | `/api/v1/video/devices/{id}/ptz` | `video:ptz` | 云台控制 |
| POST | `/api/v1/video/devices/{id}/snapshot` | `video:stream` | 截图 |

### 6.4 录像管理

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/video/devices/{id}/record/start` | `video:record` | 开始录像 |
| POST | `/api/v1/video/devices/{id}/record/stop` | `video:record` | 停止录像 |

---

## 7. 后端实现

### 7.1 文件结构

```
firefly-system/src/main/java/.../system/
├── entity/
│   ├── VideoDevice.java
│   ├── VideoChannel.java
│   └── StreamSession.java
├── dto/video/
│   ├── VideoDeviceVO.java
│   ├── VideoDeviceCreateDTO.java
│   ├── VideoDeviceUpdateDTO.java
│   ├── VideoDeviceQueryDTO.java
│   ├── VideoChannelVO.java
│   ├── StreamSessionVO.java
│   ├── StreamStartDTO.java
│   └── PtzControlDTO.java
├── convert/
│   └── VideoConvert.java
├── mapper/
│   ├── VideoDeviceMapper.java
│   ├── VideoChannelMapper.java
│   └── StreamSessionMapper.java
├── service/
│   └── VideoService.java
└── controller/
    └── VideoController.java
```

---

## 8. 前端交互设计

### 8.1 视频监控页面

- **设备列表**: 视频设备表格，含在线状态
- **产品联动上下文**: 若从摄像头产品页进入，则在页头下方仅展示产品名称、ProductKey、接入方式，并提供“新增设备 / 清空联动”动作
- **创建设备抽屉**: 使用抽屉而非弹窗，分组展示基础字段、GB28181 专属字段、SIP 鉴权开关和产品上下文
- **编辑设备抽屉**: 在列表侧边继续维护 GB 域、传输协议和设备级 SIP 密码
- **协议锁定**: 存在产品上下文时，`streamMode` 自动锁定为产品协议，不允许在创建设备时切换
- **实时预览**: 选择设备/通道，使用 FLV.js 播放实时视频流
- **PTZ 控制面板**: 方向控制按钮 + 变焦按钮
- **路由**: `/video`

### 8.2 GB28181 注册口径

- 若视频设备未开启 SIP 鉴权，平台直接对 `REGISTER / MESSAGE / BYE` 返回 `200 OK`。
- 若视频设备开启 SIP 鉴权，平台以 `GB 设备编号` 作为用户名，基于设备级 `sip_password` 执行 MD5 Digest 校验。
- 平台不再保留误导性的全局 `gb28181.sip.password` 空配置。

---

## 9. 非功能性需求

| 需求 | 指标 |
|------|------|
| **并发流** | 单节点 200 路并发播放 |
| **延迟** | FLV < 2s, WebRTC < 500ms |
| **协议转换** | ZLMediaKit 自动 RTSP/RTMP/GB28181 → HLS/FLV/WebRTC |
| **录像存储** | MinIO, 按 `/{tenantId}/{deviceId}/{date}/` 路径组织 |
