# Connector 管理面鉴权与 Kafka 重试/死信 使用说明

> **适用角色**: 租户运维、集成商；设备侧对接人员

---

## 1. 管理接口访问

Connector 的 Modbus/SNMP/TCP-UDP/WebSocket/LoRaWAN 管理接口不再允许匿名访问，统一经网关访问：

```
POST http://<gateway>:8080/CONNECTOR/api/v1/modbus/test
Authorization: Bearer <JWT>
```

未携带 JWT 或 Token 无效返回 401。

## 2. 设备侧 HTTP 接入

设备 HTTP 接入地址改为网关路径：

```
POST http://<gateway>:8080/CONNECTOR/api/v1/protocol/http/auth
POST http://<gateway>:8080/CONNECTOR/api/v1/protocol/http/property/post
Header: X-Device-Token: <设备 Token>
```

MQTT（1883）、CoAP（5683/udp）连接地址不变。

## 3. Webhook 令牌

若使用外部 MQTT Broker 回调或 LoRaWAN 网络服务器回调，需在请求头携带：

```
X-Webhook-Token: <FIREFLY_MQTT_WEBHOOK_TOKEN 或 FIREFLY_LORAWAN_WEBHOOK_TOKEN>
```

未配置令牌时保持兼容，但生产环境必须配置。

## 4. 死信与重试

- 消费失败默认重试 3 次（间隔 1 秒），仍失败则投递到 `<topic>.dlt`。
- 运维可在死信 topic 中查看失败消息，修复后重新投递到原 topic。
- 当前未提供内置重投工具，建议通过 Kafka 工具或运维脚本处理。

## 5. 注意事项

- 设备 HTTP 接入地址变更是破坏性变更，升级前需同步修改设备侧配置。
- 下行消息无在线路由时会进入 DLT，请关注 `device.message.down.dlt` 积压。
- 规则/流转重试可能重复执行副作用，告警/通知幂等仍在后续迭代处理。

## 6. 关联文档

- [设计方案](../design/connector-management-auth-kafka-reliability.md)
- [运维说明](../operations/connector-management-auth-kafka-reliability.md)
