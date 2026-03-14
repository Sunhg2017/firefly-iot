# HTTP 设备上下线与心跳使用说明
> 适用角色: 设备接入、联调测试、运维排查
> 更新时间: 2026-03-14

## 1. HTTP 设备现在怎么判定在线

HTTP 设备不是长连接，所以平台现在按“最近活跃时间”判断在线状态。

以下任一请求成功后，都会把设备视为活跃：

- 属性上报 `POST /api/v1/protocol/http/property/post`
- 事件上报 `POST /api/v1/protocol/http/event/post`
- 通用数据上报 `POST /api/v1/protocol/http/data/{action}`
- 心跳 `POST /api/v1/protocol/http/heartbeat`

如果设备此前不在线，平台会自动把它切换为在线。

## 2. 为什么只调用 `/auth` 还不算在线

`/auth` 只代表设备凭证合法、拿到了 token，不代表设备已经真的开始运行。

所以平台把“成功业务请求”或“成功心跳”作为真正的在线依据，这样更符合实际运行状态。

## 3. 心跳怎么发

请求方式：

```http
POST /api/v1/protocol/http/heartbeat
X-Device-Token: your-device-token
```

说明：

- 不需要复杂请求体
- 只要 token 有效即可
- 心跳成功后会刷新设备在线租约

## 4. 设备什么时候会离线

当设备在一段时间内没有任何有效 HTTP 请求，超过离线超时阈值后，平台会自动把它标记为离线。

默认超时是 300 秒。

## 5. 推荐用法

- 有持续属性上报的设备
  - 可以不单独发心跳，直接把业务上报当成活跃刷新

- 长时间无业务上报的设备
  - 建议定时调用 `/heartbeat`

- 建议心跳间隔
  - 小于离线超时的一半
  - 默认配置下建议 30 到 120 秒
