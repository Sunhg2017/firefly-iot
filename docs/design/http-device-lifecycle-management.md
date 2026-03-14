# HTTP 设备上下线与心跳管理设计说明
> 版本: v1.0.0
> 日期: 2026-03-14
> 状态: Done

## 1. 背景

HTTP 设备接入原先只有认证与数据上报能力，没有完整的在线状态管理：

- `/api/v1/protocol/http/auth` 只负责鉴权和签发 token
- `property/post`、`event/post`、`data/{action}` 只转发业务消息
- 没有专门的 HTTP 心跳入口
- 没有基于超时的 HTTP 设备离线判定

这会导致 HTTP 设备虽然持续上报数据，但设备管理页在线状态无法及时建立，也无法在停止上报后自动离线。

## 2. 目标

- 为 HTTP 设备补齐“上线、心跳、离线”完整链路
- 不引入长连接语义，保持 HTTP 无连接协议特性
- 复用现有 `DEVICE_ONLINE` / `DEVICE_OFFLINE` 生命周期消息链路
- 支持通过配置调整超时阈值和扫描周期

## 3. 设计原则

- HTTP 不以 `/auth` 作为真正上线依据
  - 认证成功只说明凭证合法，不代表设备已经进入稳定运行态
- 首次有效业务请求或显式心跳才视为上线
- 后续有效请求只刷新活跃时间，不重复发上线事件
- 离线由“心跳超时”判定，而不是连接断开

## 4. 方案

## 4.1 活跃刷新

`firefly-connector` 新增 `HttpDeviceLifecycleService`，对以下请求统一做活跃刷新：

- `POST /api/v1/protocol/http/property/post`
- `POST /api/v1/protocol/http/event/post`
- `POST /api/v1/protocol/http/data/{action}`
- `POST /api/v1/protocol/http/heartbeat`

处理逻辑：

1. 先按 token 解析设备身份
2. 刷新 Redis 在线标记 TTL
3. 刷新 Redis 最近活跃时间索引
4. 若该设备此前不在线，则补发 `DEVICE_ONLINE`

## 4.2 显式心跳接口

新增接口：

- `POST /api/v1/protocol/http/heartbeat`

用途：

- 设备没有属性或事件要上报时，也可以通过心跳维持在线状态
- 心跳本身不写入业务遥测或事件数据，只更新生命周期状态

## 4.3 离线判定

新增定时离线扫描：

- `firefly-connector` 启用调度器
- 周期性扫描 HTTP 设备最近活跃时间
- 超过超时阈值且在线标记已过期的设备，补发 `DEVICE_OFFLINE`

这样离线仍然走已有生命周期消息主题，由 `firefly-device` 侧统一更新 `onlineStatus`、`lastOfflineAt` 和运维事件。

## 5. Redis 结构

- 最近活跃索引：`connector:http:device:last-seen`
  - ZSET
  - score 为最近活跃时间戳
  - member 为 `tenantId:productId:deviceId`

- 在线标记：`connector:http:device:online:{tenantId}:{productId}:{deviceId}`
  - String
  - 使用 TTL 表示在线租约

说明：

- 在线标记用于快速判断“首次上线”与“是否已经超时”
- ZSET 用于定时扫描候选设备，避免全量扫描 Redis key

## 6. 配置项

- `firefly.http.presence-timeout-seconds`
  - 默认 `300`
  - 含义：HTTP 设备无活跃请求多久后判定离线

- `firefly.http.presence-sweep-interval-seconds`
  - 默认 `30`
  - 含义：离线扫描周期

对应环境变量：

- `FIREFLY_HTTP_PRESENCE_TIMEOUT_SECONDS`
- `FIREFLY_HTTP_PRESENCE_SWEEP_INTERVAL_SECONDS`

## 7. 关键取舍

- 没有把 `/auth` 直接当作上线
  - 避免设备只取 token、不真正上报时被误判在线

- 没有新增 `HEARTBEAT` 消息类型
  - 当前只需要维护生命周期状态，使用现有 `DEVICE_ONLINE` / `DEVICE_OFFLINE` 即可
  - 如后续规则引擎需要消费独立心跳事件，再扩展消息类型更合适

## 8. 风险与边界

- HTTP 本质上是“最后活跃时间模型”，不是物理连接在线模型
- 极端并发下，超时扫描与新请求可能短暂交错，最坏情况会出现一次离线后立即再次上线的补偿事件
- 这类瞬时抖动比“长时间卡在线”风险更低，且现有生命周期链路可以正确收敛最终状态
