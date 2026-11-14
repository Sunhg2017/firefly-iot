# 数据流转中心 设计方案文档

> **版本**: v1.0.0
> **日期**: 2026-11-14
> **状态**: Draft
> **模块**: firefly-rule（新增 `dataforward` 特性域）、firefly-device（事件生产）、firefly-common（枚举/消息模型）

---

## 1. 背景与目标

### 1.1 背景

当前平台已具备设备接入、物模型、设备影子、规则引擎、告警等能力，但设备数据的「对外集成」能力存在明显缺口：

- 规则引擎动作仅有 `KAFKA_FORWARD / WEBHOOK / EMAIL / SMS / DEVICE_COMMAND`，且 `DB_WRITE` 已在 `V6__cleanup_unsupported_rule_actions.sql` 中作为不支持动作移除。
- 无法把命中规则的设备数据转发到客户自己的 **MQTT Broker**、**RabbitMQ** 或外部 **时序库（InfluxDB / TDengine）**。
- 没有统一的「平台事件对外订阅」能力：设备创建、上下线、告警触发、OTA 进度等事件无法以 Webhook 形式推送给外部系统。

### 1.2 目标

在平台内新增独立的「数据流转中心」模块，提供两类能力：

1. **数据流转规则（Data Forward Rule）**：按消息源匹配 + 条件过滤，把设备实时数据转发到
   - 第三方 MQTT Broker（MQTT 桥接）
   - RabbitMQ（AMQP）
   - 外部时序库（InfluxDB / TDengine）
   - Webhook（HTTP 推送）
2. **事件订阅（Event Subscription）**：把平台事件（`DEVICE_CREATED / DEVICE_ONLINE / DEVICE_OFFLINE / ALERT_TRIGGERED / OTA_PROGRESS`）通过带 HMAC 签名的 Webhook 推送给外部系统。

### 1.3 非目标

- 不实现「写入平台自身 PostgreSQL/TimescaleDB」作为流转目标（数据落库仍由 `firefly-device` 完成）。
- 不实现规则 DAG 流水线、Serverless 函数、Kafka Connect 等设计文档中长期规划能力。
- 不实现租户级配额/计费。

---

## 2. 总体架构

```
设备 ──► firefly-connector ──► Kafka(device.*)
                                  │
                    firefly-device（消息路由/落库）
                       │                        │
            规则引擎输入 topic           平台事件 topic
           (rule.engine.input)         (platform.event)
                       │                        │
                 ┌─────┴──────────┐             │
                 ▼                ▼             ▼
        firefly-rule:规则引擎  firefly-rule:数据流转运行时   firefly-rule:事件订阅运行时
        (group firefly-rule-runtime)  (group firefly-data-forward)  (group firefly-event-subscription)
```

- **数据流转运行时**：独立消费组 `firefly-data-forward` 消费 `rule.engine.input`，与规则引擎运行时互不影响。
- **事件订阅运行时**：独立消费组 `firefly-event-subscription` 消费 `platform.event`。

---

## 3. 数据模型

### 3.1 数据流转规则 `data_forward_rules`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGSERIAL PK | 主键 |
| tenant_id | BIGINT | 租户（数据隔离） |
| project_id | BIGINT | 可选项目范围 |
| name | VARCHAR(256) | 规则名称 |
| description | TEXT | 描述 |
| source_pattern | VARCHAR(256) | 消息源匹配（消息类型名或 Topic 通配，如 `PROPERTY_REPORT`、`/sys/*/thing/property/post`） |
| match_condition | TEXT | 可选 SpEL 过滤条件 |
| target_type | VARCHAR(32) | `MQTT` / `AMQP` / `TSDB` / `WEBHOOK` |
| target_config | JSONB | 目标连接 + 数据映射（见 §3.3） |
| status | VARCHAR(16) | `ENABLED` / `DISABLED` |
| trigger_count / success_count / error_count | BIGINT | 运行计数 |
| last_trigger_at | TIMESTAMPTZ | 最近触发时间 |
| created_by | BIGINT | 创建人 |
| created_at / updated_at | TIMESTAMPTZ | 时间戳 |

### 3.2 事件订阅 `event_subscriptions`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGSERIAL PK | 主键 |
| tenant_id | BIGINT | 租户 |
| name | VARCHAR(256) | 订阅名称 |
| event_types | JSONB | 订阅事件类型数组（`PlatformEventType` 值） |
| webhook_url | VARCHAR(512) | 回调地址 |
| secret | VARCHAR(256) | HMAC-SHA256 签名密钥（可空） |
| headers | JSONB | 自定义请求头（可空） |
| status | VARCHAR(16) | `ENABLED` / `DISABLED` |
| delivery_count / success_count / error_count | BIGINT | 投递计数 |
| last_delivered_at | TIMESTAMPTZ | 最近投递时间 |
| created_by / created_at / updated_at | — | 时间戳 |

### 3.3 `target_config` 结构

**MQTT**：

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

**AMQP（RabbitMQ）**：

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

**TSDB**：

```json
{
  "engine": "INFLUXDB",
  "url": "http://influxdb.example.com:8086",
  "token": "secret",
  "org": "firefly",
  "bucket": "device-data",
  "measurement": "device_telemetry",
  "tags": { "deviceName": "${deviceName}" },
  "fields": { "temperature": "${payload.temperature}", "humidity": "${payload.humidity}" }
}
```

或

```json
{
  "engine": "TDENGINE",
  "url": "http://tdengine.example.com:6041",
  "user": "root",
  "password": "secret",
  "database": "firefly",
  "sqlTemplate": "INSERT INTO d${deviceId} USING device_telemetry TAGS ('${deviceName}') VALUES (NOW, ${payload.temperature}, ${payload.humidity})"
}
```

**WEBHOOK**：复用规则引擎 Webhook 语义（`url / method / headers / body`）。

### 3.4 平台事件信封 `PlatformEvent`

```java
public class PlatformEvent {
    private String eventId;          // UUID
    private PlatformEventType eventType;
    private Long tenantId;
    private Long productId;
    private Long deviceId;
    private String deviceName;
    private Map<String, Object> payload;
    private long timestamp;          // epoch millis
}
```

---

## 4. 运行时设计

### 4.1 数据流转运行时 `DataForwardRuntimeService`

1. `DataForwardConsumer` 消费 `rule.engine.input`（group `firefly-data-forward`），反序列化 `DeviceMessage`。
2. `DataForwardRuntimeService.process(message)`：
   - 按 `tenantId` 加载启用规则；
   - 用与规则引擎一致的「源匹配（通配）+ SpEL 条件」判定命中；
   - 命中后调用 `DataForwardTargetExecutor.execute(rule, message, variables)`；
   - 更新触发/成功/失败计数。
3. 目标执行器按 `target_type` 分发：

| target_type | 实现 | 连接策略 |
| --- | --- | --- |
| MQTT | Eclipse Paho `MqttAsyncClient` | 按 `broker+username` 缓存客户端，懒初始化 + 断线重连 |
| AMQP | `com.rabbitmq:amqp-client` | 按连接参数缓存 `Connection/Channel`，懒初始化 + 重连 |
| TSDB | HTTP（InfluxDB v2 line protocol / TDengine RESTful SQL） | 无状态，复用共享 HttpClient |
| WEBHOOK | 共享 HttpClient | 无状态 |

- 模板渲染复用规则引擎的 `${expr}` + SpEL 求值口径（`renderString` / `renderJsonValue`），保证与规则引擎一致。

### 4.2 事件订阅运行时 `EventSubscriptionRuntimeService`

1. `EventSubscriptionConsumer` 消费 `platform.event`（group `firefly-event-subscription`）。
2. 按租户加载启用订阅，按 `eventTypes` 过滤。
3. 投递 Webhook：
   - 默认 `POST` + `application/json`；
   - 若配置 `secret`，追加 `X-Firefly-Signature` = `HMAC-SHA256(secret, rawBody)`、`X-Firefly-Event`、`X-Firefly-Timestamp`；
   - HTTP 状态码 `>= 400` 视为失败，计入 error_count。

---

## 5. 事件生产（跨服务）

新增 Kafka topic `platform.event`，`PlatformEvent` 信封。

| 事件 | 生产者 | 触发点 |
| --- | --- | --- |
| `DEVICE_CREATED` | firefly-device | `DeviceService.createDevice` / `createDeviceFromInternal` / 导入成功后 |
| `DEVICE_ONLINE` | firefly-device | `MessageRouterService.handleDeviceOnline` |
| `DEVICE_OFFLINE` | firefly-device | `MessageRouterService.handleDeviceOffline` |
| `OTA_PROGRESS` | firefly-device | `MessageRouterService.handleOtaProgress` |
| `ALERT_TRIGGERED` | firefly-rule | `AlarmRuntimeService` 创建告警记录后 |

生产失败只记录日志，不阻塞主流程（事件订阅为尽力投递语义）。

---

## 6. 接口设计

### 6.1 数据流转规则 `/api/v1/data-forward-rules`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/list` | 分页查询 |
| GET | `/{id}` | 详情 |
| POST | `/` | 创建 |
| PUT | `/{id}` | 更新 |
| DELETE | `/{id}` | 删除 |
| PUT | `/{id}/enable` | 启用 |
| PUT | `/{id}/disable` | 停用 |

### 6.2 事件订阅 `/api/v1/event-subscriptions`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/list` | 分页查询 |
| GET | `/{id}` | 详情 |
| POST | `/` | 创建 |
| PUT | `/{id}` | 更新 |
| DELETE | `/{id}` | 删除 |
| PUT | `/{id}/enable` | 启用 |
| PUT | `/{id}/disable` | 停用 |

### 6.3 网关路由

复用现有 `/RULE/api/v1/**` → `firefly-rule`，无需新增网关前缀。

---

## 7. 权限与菜单

新增两个租户工作区菜单项，归属新分组「数据流转」`tenant-data-forward`：

| menu_key | 权限 | 说明 |
| --- | --- | --- |
| `data-forward` | `data-forward:read/create/update/delete` | 数据流转规则 |
| `event-subscription` | `event-subscription:read/create/update/delete` | 事件订阅 |

权限点、`permission_resources`、`permission_groups`、`role_permissions`、`tenant_menu_configs`、`workspace_menu_catalog`、`workspace_menu_permission_catalog`、默认权限，以及前端图标映射，均通过 Flyway SQL 与前端配置同步落地。

---

## 8. 关键设计取舍

1. **复用 `rule.engine.input` 作为流转源**：避免改动 `firefly-device` 的消息路由，同时天然拿到归一化后的设备消息（含 `type/topic/payload/deviceName`）。
2. **独立消费组而非复用规则引擎消费组**：保证流转与规则引擎的吞吐/失败互不影响。
3. **事件订阅独立走 `platform.event`**：平台事件与设备数据流语义不同，独立信封与 topic 更清晰；`DEVICE_ONLINE/OFFLINE/OTA_PROGRESS` 在 `MessageRouterService` 内补充生产，复用已有归一化消息。
4. **外部连接懒初始化 + 缓存**：MQTT/AMQP 维护长连接复用；TSDB/Webhook 走无状态 HTTP。
5. **凭据（MQTT 密码、RabbitMQ 密码、InfluxDB token、TDengine 密码、HMAC secret）明文存 JSONB**：与既有通知渠道/AppKey 口径一致；后续如需加密可统一引入字段级加密。
6. **尽力投递语义**：流转/投递失败仅计数与日志，不重试入队，避免放大外部系统故障（后续可加异步重试）。

---

## 9. 风险与边界

- 外部系统不可达时，MQTT/AMQP 重连失败仅计失败，不阻塞消费线程。
- 高吞吐下同步 HTTP（TSDB/Webhook）可能成为瓶颈；首版接受，后续可改异步批量。
- 事件生产与消费的 Kafka 均需保证 topic 存在（`platform.event` 随部署自动创建，或由运维预建）。

---

## 10. 关联文档

- [产品设计](product-design.md)
- [规则引擎详细设计](detailed-design-rule-engine.md)
- 运维说明：`docs/operations/data-forwarding-center-operations.md`
- 使用说明：`docs/user-guide/data-forwarding-center.md`
