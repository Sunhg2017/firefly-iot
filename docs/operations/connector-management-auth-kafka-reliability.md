# Connector 管理面鉴权与 Kafka 重试/死信 运维说明

> **模块**: firefly-connector、firefly-gateway、firefly-common、firefly-rule、firefly-system、firefly-device
> **版本**: v1.0.0

---

## 1. 部署变化

- Connector 9070 不再映射到宿主机；管理接口与设备 HTTP 统一经网关 `8080` 访问。
- 设备侧接入地址变化（破坏性）：
  - 旧：`http://<connector-host>:9070/api/v1/protocol/http/...`
  - 新：`http://<gateway-host>:8080/CONNECTOR/api/v1/protocol/http/...`
- MQTT 1883、CoAP 5683/udp 保持宿主机映射。

## 2. 配置项

| 配置 | 环境变量 | 默认 | 说明 |
| --- | --- | --- | --- |
| `firefly.mqtt.webhook-token` | `FIREFLY_MQTT_WEBHOOK_TOKEN` | 空 | 外部 Broker 回调令牌，配置后必须携带 `X-Webhook-Token` |
| `firefly.lorawan.webhook-token` | `FIREFLY_LORAWAN_WEBHOOK_TOKEN` | 空 | LoRaWAN 回调令牌 |
| `firefly.kafka.consumer.retry-max-attempts` | `FIREFLY_KAFKA_CONSUMER_RETRY_MAX_ATTEMPTS` | 3 | 消费失败重试次数（不含首次） |
| `firefly.kafka.consumer.retry-interval-ms` | `FIREFLY_KAFKA_CONSUMER_RETRY_INTERVAL_MS` | 1000 | 重试间隔 |

> 生产环境必须配置两个 webhook 令牌；否则任意来源可伪造设备上行。

## 3. 鉴权行为

- Connector 管理接口（modbus/snmp/tcp-udp/websocket/lorawan 管理）必须携带有效 JWT；无 Token 返回 401。
- 设备侧 webhook 配置令牌后，未携带或不匹配返回 403。
- 网关白名单只放行设备侧路径；管理路径仍走 JWT 校验。

## 4. 死信 topic

| 来源 | 死信 topic |
| --- | --- |
| 设备上行 | `device.property.report.dlt`、`device.event.report.dlt`、`device.lifecycle.dlt`、`device.message.up.dlt`、`device.ota.progress.dlt` |
| 下行 | `device.message.down.dlt` |
| 规则/流转 | `rule.engine.input.dlt`、`platform.event.dlt` |
| 协议解析变更 | `protocol.parser.changed.dlt` |
| 视频运行时 | `<video event topic>.dlt` |
| 系统事件 | `permission.events.dlt`、`role.events.dlt`、`api.access.logs.dlt`、`auth.events.dlt` |

- Kafka 需允许自动创建 `<topic>.dlt`，或由运维预建。
- 建议为 DLT 积压配置监控告警，并提供重投工具（消费 DLT 后重新投递原 topic）。

## 5. 故障排查

| 现象 | 排查 |
| --- | --- |
| 管理接口 401 | 确认请求经网关且携带 JWT；确认网关白名单未误放管理路径 |
| 设备 HTTP 接入 404 | 确认设备使用 `/CONNECTOR/api/v1/protocol/http/...` 且网关路由正常 |
| webhook 403 | 检查 `X-Webhook-Token` 与配置是否一致 |
| 下行 DLT 积压 | 设备离线/路由过期导致无在线通道；检查设备重连与路由心跳 |
| 消费持续重试 | 查看服务日志中的异常，修复后可从 DLT 重投 |

## 6. 回滚

- 回退 `firefly-connector` / `firefly-gateway` / `firefly-common` 及各业务服务镜像。
- 若需临时恢复 9070 公网访问，可在 Compose 重新加入 `"9070:9070"`，但不建议在生产使用。
- 死信 topic 与重试配置为运行期参数，回滚代码后仍保留。
