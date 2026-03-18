# HTTP 设备上下线与心跳使用说明
> 适用角色: 设备接入、联调测试、运维排查
> 更新时间: 2026-03-19

## 1. HTTP 生命周期现在怎么发

HTTP 设备的 `online`、`offline`、`heartbeat` 仍然是物模型事件，但不能再通过普通事件接口上报。

请使用以下专用端点：

- 上线：`POST /api/v1/protocol/http/online`
- 离线：`POST /api/v1/protocol/http/offline`
- 心跳：`POST /api/v1/protocol/http/heartbeat`

普通业务事件继续使用：

- `POST /api/v1/protocol/http/event/post`

## 2. 推荐调用顺序

### 2.1 设备启动

1. 调用 `POST /api/v1/protocol/http/auth`
2. 取到 token 后调用 `POST /api/v1/protocol/http/online`
3. 后续正常调用属性上报、普通事件上报、心跳

### 2.2 设备运行中

- 有业务数据时，可以继续发属性或普通事件
- 长时间没有业务数据时，建议定时发 `/heartbeat`

### 2.3 设备主动断开

1. 调用 `POST /api/v1/protocol/http/offline`
2. 平台会立即把设备切为离线

## 3. 为什么不能再把上线、离线、心跳发到 `/event/post`

因为普通事件接口只能处理事件本身，不能正确触发平台生命周期链路。

如果把以下事件打到 `/event/post`：

- `online`
- `offline`
- `heartbeat`

服务端会直接拒绝，请求返回：

- HTTP 状态：`400`
- 错误码：`HTTP_LIFECYCLE_EVENT_MUST_USE_DEDICATED_ENDPOINT`

## 4. 请求示例

### 4.1 上线

```http
POST /api/v1/protocol/http/online
X-Device-Token: your-device-token
Content-Type: application/json

{
  "identifier": "online",
  "ip": "192.168.1.10"
}
```

效果：

- 平台设备状态切为在线
- 物模型事件流中同时出现 `online` 事件

### 4.2 心跳

```http
POST /api/v1/protocol/http/heartbeat
X-Device-Token: your-device-token
Content-Type: application/json

{
  "identifier": "heartbeat",
  "intervalSec": 30
}
```

效果：

- 刷新在线租约
- 物模型事件流中同时出现 `heartbeat` 事件

### 4.3 离线

```http
POST /api/v1/protocol/http/offline
X-Device-Token: your-device-token
Content-Type: application/json

{
  "identifier": "offline",
  "reason": "manual_disconnect"
}
```

效果：

- 平台设备立即切为离线
- 物模型事件流中同时出现 `offline` 事件

## 5. 在线状态判定规则

HTTP 不是长连接，平台按“最近活跃时间”维护在线状态。

以下请求成功后，都会刷新活跃时间：

- `POST /api/v1/protocol/http/online`
- `POST /api/v1/protocol/http/heartbeat`
- `POST /api/v1/protocol/http/property/post`
- `POST /api/v1/protocol/http/event/post`
- `POST /api/v1/protocol/http/data/{action}`

如果设备长时间没有任何活跃请求，超过离线超时阈值后，平台会自动离线。默认超时为 `300` 秒。

## 6. 推荐实践

- 有持续属性上报的设备
  - 可以把业务上报当作活跃刷新

- 有空闲周期的设备
  - 建议定时发送 `/heartbeat`

- 会主动退出的设备
  - 退出前显式调用 `/offline`

- 心跳间隔建议
  - 小于离线超时的一半
  - 默认配置下建议 30 到 120 秒
