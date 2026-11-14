# Connector 管理面鉴权与 Kafka 统一重试/死信 设计方案

> **版本**: v1.0.0
> **日期**: 2026-11-15
> **模块**: firefly-connector、firefly-gateway、firefly-common、firefly-rule、firefly-system、firefly-device

---

## 1. 背景

第二轮商用就绪度审计指出：

- **P0-03**：Connector 9070 管理端口对公网开放且零鉴权，全模块 `@RequiresLogin/@RequiresPermission` 数量为 0；任意人可直接枚举/断开 TCP/UDP/WebSocket 会话并下发消息。
- **P1-11**：`RuleRuntimeConsumer`、`DataForwardConsumer`、`EventSubscriptionConsumer`、`MqttDownstreamConsumer` 仍 catch 后正常返回，死信（DLT）只覆盖 device 模块，失败会静默提交 offset。

## 2. 目标

1. Connector 管理接口必须登录后访问；设备侧 webhook 增加令牌校验；9070 不再对宿主机发布，管理和设备 HTTP 统一经网关访问。
2. 全仓 Kafka 消费者共享「有限重试 + `<topic>.dlt`」策略，失败抛回监听容器，不再静默吞异常。

## 3. 设计

### 3.1 Connector 管理面鉴权

| 接口 | 类型 | 鉴权 |
| --- | --- | --- |
| `/api/v1/modbus/**` | 管理 | 类级 `@RequiresLogin` |
| `/api/v1/snmp/**` | 管理 | 类级 `@RequiresLogin` |
| `/api/v1/tcp-udp/**` | 管理 | 类级 `@RequiresLogin` |
| `/api/v1/websocket/**` | 管理 | 类级 `@RequiresLogin` |
| `/api/v1/lorawan/**`（devices/downlink/stats/config） | 管理 | 方法级 `@RequiresLogin` |
| `/api/v1/protocol/http/**` | 设备接入 | 设备 Token（`X-Device-Token`） |
| `/api/v1/protocol/device/**` | 设备接入 | 产品密钥 |
| `/api/v1/protocol/coap/**` | 设备接入 | 设备认证 Token |
| `/api/v1/protocol/mqtt/**` | 设备侧 webhook | 可选 `X-Webhook-Token` |
| `/api/v1/lorawan/webhook/**` | 设备侧 webhook | 可选 `X-Webhook-Token` |
| `/api/v1/protocol/products/thing-model` | 设备侧辅助 | 无（按 productKey 查询） |
| `/api/v1/internal/**` | 内部 | 服务令牌（既有） |

设备侧 webhook 令牌由 `WebhookTokenFilter` 统一校验：配置了令牌则必须匹配（恒定时间比较），未配置时保持兼容。

### 3.2 端口收敛

- `docker-compose.prod.yml` / `docker-compose.github.yml` 移除 `9070:9070`，9070 只保留在 `firefly-net` 内部网络。
- 网关新增设备侧路径白名单，设备与前端统一经 `8080` 访问：
  - `/CONNECTOR/api/v1/protocol/http/`
  - `/CONNECTOR/api/v1/protocol/device/`
  - `/CONNECTOR/api/v1/protocol/coap/`
  - `/CONNECTOR/api/v1/protocol/mqtt/`
  - `/CONNECTOR/api/v1/protocol/products/`
  - `/CONNECTOR/api/v1/lorawan/webhook`（既有）
- 管理路径不在白名单，必须携带 JWT；网关转发时注入可信用户/租户头，Connector 的 `SecurityAspect` 完成登录校验。

### 3.3 Kafka 统一重试/死信

- `firefly-common` 新增 `KafkaConsumerErrorConfig`：`DefaultErrorHandler` + `DeadLetterPublishingRecoverer`，失败投递 `<topic>.dlt`。
- 重试参数：`firefly.kafka.consumer.retry-max-attempts`（默认 3）、`retry-interval-ms`（默认 1000）。
- 所有消费者（rule/data-forward/event-subscription/connector-downstream/parser-changed/video/system）失败均抛回容器；反序列化失败同样抛出。
- 删除 device 模块原有的同名配置，避免重复 Bean。

## 4. 风险与取舍

- 设备 HTTP 接入改经网关后，设备侧配置需从 `host:9070` 改为 `gateway:8080/CONNECTOR/...`，属于破坏性变更，需在升级说明中标注。
- 下行消息无在线路由时不再静默丢弃，而是重试后进入 DLT；运维需关注 `device.message.down.dlt` 积压并补偿。
- 规则/流转消费者重试会重复执行副作用，告警/通知幂等仍是独立待办（P1-15）。
- 未配置 webhook 令牌时保持兼容但存在伪造风险，生产应显式配置。

## 5. 关联文档

- [运维说明](../operations/connector-management-auth-kafka-reliability.md)
- [使用说明](../user-guide/connector-management-auth-kafka-reliability.md)
