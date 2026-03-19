# HTTP 设备上下线与心跳管理设计说明
> 版本: v1.1.0
> 日期: 2026-03-19
> 状态: Done

## 1. 背景

HTTP 设备的 `online`、`offline`、`heartbeat` 已经被定义为物模型内置事件。此前系统一度要求它们必须走专用生命周期端点，但联调场景里仍然存在一部分设备通过普通事件接口上报这三个事件。

如果普通事件入口不能识别并补齐生命周期语义，就会只产出 `EVENT_REPORT`，后续生命周期处理链路拿不到对应的 `DEVICE_ONLINE` / `DEVICE_OFFLINE`，导致：

- HTTP 主动上线后平台在线态不一定及时建立
- HTTP 主动离线后平台只能等超时扫描才离线
- 心跳虽然作为事件存在，但无法稳定承担在线保活语义

## 2. 目标

- 保持 `online`、`offline`、`heartbeat` 仍然是物模型事件
- 同时保证平台生命周期链路能正确处理 HTTP 上下线和心跳
- 保留 `/online`、`/offline`、`/heartbeat` 三个专用端点
- 同时兼容设备通过普通 `/event/post` 上报三个生命周期事件
- 保留“最后活跃时间”模型，用于 HTTP 无连接协议的在线状态管理

## 3. 设计原则

- `/auth` 只负责认证，不代表设备已经上线
- 生命周期事件仍保留为 `EVENT_REPORT`，便于规则、告警、审计按事件消费
- 生命周期语义优先通过专用 HTTP 端点表达，但普通事件入口也必须能识别并补齐这三个内置生命周期事件
- 业务属性/普通事件/通用数据仍可作为活跃刷新来源，避免设备只要有业务流量就被误判离线

## 4. 整体方案

## 4.1 生命周期专用端点

保留以下专用端点：

- `POST /api/v1/protocol/http/online`
- `POST /api/v1/protocol/http/offline`
- `POST /api/v1/protocol/http/heartbeat`

三个端点都使用 `X-Device-Token` 鉴权，并允许携带可选 JSON 请求体。请求体会被补齐以下通用字段：

- `identifier`
- `eventType`
- `protocol`
- `timestamp`

其中 `online` / `offline` / `heartbeat` 的物模型事件仍然以 `EVENT_REPORT` 形式写入 `/sys/http/{deviceId}/thing/event/post`。

## 4.2 生命周期语义与事件双写

专用端点不只发事件，还会显式驱动生命周期服务：

### `/online`

1. 校验 token
2. `markActive(auth, "online")`
3. 若首次上线，发布 `DEVICE_ONLINE`
4. 同时发布内置 `online` 事件

### `/offline`

1. 校验 token
2. `markOffline(auth, reason)`
3. 立即清理 Redis 在线标记与最近活跃索引
4. 立即发布 `DEVICE_OFFLINE`
5. 同时发布内置 `offline` 事件

### `/heartbeat`

1. 校验 token
2. `markActive(auth, "heartbeat")`
3. 刷新在线租约与最近活跃时间
4. 同时发布内置 `heartbeat` 事件

这样生命周期链路与事件链路保持一致：

- 平台在线状态依赖 `DEVICE_ONLINE` / `DEVICE_OFFLINE`
- 物模型、规则和审计仍可消费 `online` / `offline` / `heartbeat` 事件

## 4.3 普通事件接口兼容生命周期事件

`POST /api/v1/protocol/http/event/post` 继续负责普通业务事件，同时新增生命周期识别：

- 当 `identifier` 或 `eventType` 为 `online`
  - 触发 `markActive(auth, "online")`
  - 发布内置 `online` 事件

- 当 `identifier` 或 `eventType` 为 `heartbeat`
  - 触发 `markActive(auth, "heartbeat")`
  - 发布内置 `heartbeat` 事件

- 当 `identifier` 或 `eventType` 为 `offline`
  - 触发 `markOffline(auth, reason)`
  - 发布内置 `offline` 事件

- 其他事件
  - 仍按普通业务事件处理
  - 触发 `markActive(auth, "event")`

这样可以保证两条入口都能收敛到同一套生命周期链路，而不是让普通事件入口再次失效。

## 4.4 活跃刷新与超时离线

`HttpDeviceLifecycleService` 继续承担 HTTP 在线租约管理，对以下请求刷新活跃时间：

- `POST /api/v1/protocol/http/property/post`
- `POST /api/v1/protocol/http/event/post`
- `POST /api/v1/protocol/http/data/{action}`
- `POST /api/v1/protocol/http/online`
- `POST /api/v1/protocol/http/heartbeat`

当超时扫描发现：

- 最近活跃时间已早于阈值
- 且在线标记 TTL 已失效

则补发 `DEVICE_OFFLINE(reason=heartbeat_timeout)`。

## 4.5 模拟器联动

设备模拟器当前统一走专用生命周期接口：

- HTTP 连接成功后：`/auth` -> `/online`
- HTTP 主动断开时：`/offline`
- HTTP 定时保活时：`/heartbeat`
- 批量连接、批量断开、场景编排也统一复用同一套运行时封装

但服务端仍兼容：

- 第三方设备通过 `/event/post` 上报 `online`
- 第三方设备通过 `/event/post` 上报 `offline`
- 第三方设备通过 `/event/post` 上报 `heartbeat`

## 4.6 首次上线激活联动

`firefly-device` 在消费 `DEVICE_ONLINE` 生命周期消息后，不仅更新 `onlineStatus=ONLINE`，还会执行以下收口：

- 如果设备当前是 `INACTIVE`，则同步切换为 `ACTIVE`
- 如果设备尚未记录 `activatedAt`，则以本次上线时间写入首次激活时间
- 已经是 `ACTIVE` 的设备再次上线时，只刷新在线时间，不覆盖历史 `activatedAt`

这样可以保证：

- 一型一密动态注册设备首次真正连上平台后，会从“未激活”变为“已激活”
- 预创建设备首次上线时，同样遵循“至少成功上线一次即视为激活”的设备状态模型
- 平台“设备状态”和“在线状态”不会再出现“在线但仍未激活”的口径撕裂

## 5. Redis 结构

- 最近活跃索引：`connector:http:device:last-seen`
  - 类型：`ZSET`
  - score：最近活跃时间戳
  - member：`tenantId:productId:deviceId`

- 在线标记：`connector:http:device:online:{tenantId}:{productId}:{deviceId}`
  - 类型：`String`
  - TTL：在线租约

说明：

- 在线标记用于判断首次上线与是否已超时
- ZSET 用于按时间窗口扫描候选离线设备，避免全量扫描 Redis key

## 6. 配置项

- `firefly.http.presence-timeout-seconds`
  - 默认 `300`
  - HTTP 设备无活跃请求多久后判定离线

- `firefly.http.presence-sweep-interval-seconds`
  - 默认 `30`
  - 离线扫描周期

对应环境变量：

- `FIREFLY_HTTP_PRESENCE_TIMEOUT_SECONDS`
- `FIREFLY_HTTP_PRESENCE_SWEEP_INTERVAL_SECONDS`

## 7. 关键取舍

- 没有把 `/auth` 直接当作上线
  - 避免设备只拿 token 不上报时被误判在线

- 没有新增独立心跳消息类型
  - 平台生命周期继续复用 `DEVICE_ONLINE` / `DEVICE_OFFLINE`
  - 业务侧通过内置 `heartbeat` 事件消费心跳语义

- 主动离线立即生效，不再只依赖超时扫描
  - 降低平台在线态滞后
  - 更符合模拟器和真实设备的显式断开行为

## 8. 风险与边界

- HTTP 仍然是“最后活跃时间模型”，不是物理连接模型
- 不同客户端可以走专用端点或普通事件入口，但两者都必须保持相同生命周期语义
- 极端并发下，显式离线与新心跳可能短暂交错，最终状态仍以最后一次有效生命周期动作为准
