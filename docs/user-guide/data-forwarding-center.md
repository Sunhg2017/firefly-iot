# 数据流转中心 使用说明

> **适用角色**: 租户管理员、租户运维/集成人员（需具备 `data-forward:*` / `event-subscription:*` 权限）
> **入口**: 租户工作区 → 「数据流转」分组 → 「数据流转规则」/「事件订阅」

---

## 1. 功能概览

数据流转中心提供两类对外集成能力：

1. **数据流转规则**：把设备实时数据（属性上报、事件上报、设备上下线、OTA 进度等）按消息源与条件过滤后，转发到外部系统。
2. **事件订阅**：把平台事件（设备创建、上线、离线、告警触发、OTA 进度）通过带签名的 Webhook 推送给外部系统。

---

## 2. 数据流转规则

### 2.1 操作步骤

1. 进入「数据流转」→「数据流转规则」。
2. 点击「新建规则」。
3. 填写：
   - **规则名称**：必填。
   - **所属项目**：可选，限定规则只在某项目下的设备消息上生效。
   - **消息源**：必填。可直接选消息类型（如 `PROPERTY_REPORT`、`EVENT_REPORT`、`DEVICE_ONLINE`、`DEVICE_OFFLINE`、`OTA_PROGRESS`），也可填 Topic 通配（如 `/*/sys/*/thing/property/post`）。
   - **过滤条件**：可选，SpEL 表达式，如 `payload.temperature > 50`。
   - **转发目标**：必选，MQTT / RabbitMQ / 时序库 / Webhook。
   - **目标配置**：JSON，切换转发目标时自动填充模板。
4. 点击「保存」创建，规则初始为「已停用」。
5. 在列表点击「启用」后开始生效。

### 2.2 目标配置示例

**MQTT 桥接（第三方 Broker）**

```json
{
  "broker": "tcp://emqx.example.com:1883",
  "username": "forward",
  "password": "secret",
  "clientIdPrefix": "firefly-forward",
  "topic": "firefly/${deviceName}/up",
  "qos": 1,
  "retained": false,
  "payloadTemplate": { "deviceName": "${deviceName}", "payload": "${payloadJson}" }
}
```

**RabbitMQ**

```json
{
  "host": "rabbitmq.example.com",
  "port": 5672,
  "vhost": "/",
  "username": "forward",
  "password": "secret",
  "exchange": "firefly",
  "exchangeType": "topic",
  "routingKey": "device.${deviceName}",
  "payloadTemplate": { "deviceName": "${deviceName}", "payload": "${payloadJson}" }
}
```

**InfluxDB v2**

```json
{
  "engine": "INFLUXDB",
  "url": "http://influxdb.example.com:8086",
  "token": "secret",
  "org": "firefly",
  "bucket": "device-data",
  "measurement": "device_telemetry",
  "tags": { "deviceName": "${deviceName}" },
  "fields": { "temperature": "${payload.temperature}" }
}
```

**TDengine**

```json
{
  "engine": "TDENGINE",
  "url": "http://tdengine.example.com:6041",
  "user": "root",
  "password": "secret",
  "database": "firefly",
  "sqlTemplate": "INSERT INTO d${deviceId} USING device_telemetry TAGS ('${deviceName}') VALUES (NOW, ${payload.temperature})"
}
```

**Webhook**

```json
{
  "url": "https://example.com/hooks/device-event",
  "method": "POST",
  "headers": { "X-Tenant": "demo" },
  "body": { "deviceName": "${deviceName}", "payload": "${payloadJson}" }
}
```

### 2.3 可用占位符

`${deviceId}`、`${deviceName}`、`${productId}`、`${tenantId}`、`${type}`、`${topic}`、`${timestamp}`、`${payloadJson}`，以及 `payload` 内的扁平属性（如 `${payload.temperature}`）。

### 2.4 注意事项

- 规则初始为停用状态，需手动启用。
- 目标配置为必填字段，且不同目标要求的必填字段不同（如 MQTT 需 `broker`/`topic`、RabbitMQ 需 `host`/`exchange`）。
- 转发失败只计入失败计数并记录日志，不会自动重试；请根据失败计数排查目标连通性。
- 凭据（MQTT/RabbitMQ 密码、时序库 token、Webhook secret）当前明文存储，请确保数据库访问受控。

---

## 3. 事件订阅

### 3.1 操作步骤

1. 进入「数据流转」→「事件订阅」。
2. 点击「新建订阅」。
3. 填写：
   - **订阅名称**：必填。
   - **事件类型**：多选，必填。可选：设备创建、设备上线、设备离线、告警触发、OTA 进度。
   - **回调地址**：必填，外部系统接收事件的 HTTPS/HTTP 地址。
   - **签名密钥**：可选。配置后投递请求会携带 `X-Firefly-Signature`。
   - **自定义请求头**：可选，JSON 对象。
4. 保存后点击「启用」。

### 3.2 投递报文示例

```json
{
  "eventId": "b1e2...",
  "eventType": "DEVICE_ONLINE",
  "tenantId": 1001,
  "productId": 2001,
  "deviceId": 3001,
  "deviceName": "sensor-001",
  "payload": { "deviceName": "sensor-001" },
  "timestamp": 1763169000000
}
```

请求头：

| Header | 说明 |
| --- | --- |
| `X-Firefly-Event` | 事件类型，如 `DEVICE_ONLINE` |
| `X-Firefly-Event-Id` | 事件 ID |
| `X-Firefly-Timestamp` | 投递时间戳（毫秒） |
| `X-Firefly-Signature` | `HMAC-SHA256(secret, rawBody)`，十六进制小写（仅在配置了签名密钥时携带） |

### 3.3 校验签名（消费方示例）

```java
Mac mac = Mac.getInstance("HmacSHA256");
mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
String expected = HexFormat.of().formatHex(mac.doFinal(rawBody.getBytes(StandardCharsets.UTF_8)));
boolean valid = expected.equals(request.getHeader("X-Firefly-Signature"));
```

### 3.4 注意事项

- 事件订阅为尽力投递语义，HTTP 状态码 ≥ 400 计为失败并累加失败计数。
- 启用前会校验回调地址非空且至少选择一个事件类型。
- 同一个事件可被多个订阅同时接收。

---

## 4. 接口

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/RULE/api/v1/data-forward-rules/list` | POST | 分页查询数据流转规则 |
| `/RULE/api/v1/data-forward-rules` | POST | 创建规则 |
| `/RULE/api/v1/data-forward-rules/{id}` | GET/PUT/DELETE | 详情/更新/删除 |
| `/RULE/api/v1/data-forward-rules/{id}/enable` | PUT | 启用 |
| `/RULE/api/v1/data-forward-rules/{id}/disable` | PUT | 停用 |
| `/RULE/api/v1/event-subscriptions/list` | POST | 分页查询事件订阅 |
| `/RULE/api/v1/event-subscriptions` | POST | 创建订阅 |
| `/RULE/api/v1/event-subscriptions/{id}` | GET/PUT/DELETE | 详情/更新/删除 |
| `/RULE/api/v1/event-subscriptions/{id}/enable` | PUT | 启用 |
| `/RULE/api/v1/event-subscriptions/{id}/disable` | PUT | 停用 |

---

## 5. 关联文档

- [设计方案](../design/detailed-design-data-forwarding-center.md)
- [运维说明](../operations/data-forwarding-center-operations.md)
