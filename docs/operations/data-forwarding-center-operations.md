# 数据流转中心 运维说明

> **模块**: firefly-rule（数据流转运行时 + 事件订阅运行时）、firefly-device（平台事件生产）、firefly-common（枚举/消息模型/事件发布器）
> **版本**: v1.0.0

---

## 1. 部署方式

数据流转中心复用现有 `firefly-rule` / `firefly-device` 服务，无需新增独立服务或容器：

- 后端随 `firefly-rule`、`firefly-device` 一起构建与部署（Docker Compose 或本地 `mvn spring-boot:run`）。
- 前端随 `firefly-web` 构建，新增菜单通过 Flyway 迁移自动注册。
- 新增依赖：`org.eclipse.paho:org.eclipse.paho.client.mqttv3`（MQTT 桥接）、`com.rabbitmq:amqp-client`（RabbitMQ 转发），随 Maven 自动解析。

首次部署需保证以下基础设施可用：

| 依赖 | 用途 |
| --- | --- |
| Kafka | `rule.engine.input`（数据流转源）、`platform.event`（平台事件源） |
| PostgreSQL | 存 `data_forward_rules`、`event_subscriptions` 两张表 |
| 目标外部系统 | MQTT Broker / RabbitMQ / InfluxDB·TDengine / Webhook（按需） |

## 2. Kafka Topic

| Topic | 生产者 | 消费者 | 消费组 |
| --- | --- | --- | --- |
| `rule.engine.input` | firefly-device | firefly-rule 数据流转运行时 | `firefly-data-forward` |
| `platform.event` | firefly-device、firefly-rule | firefly-rule 事件订阅运行时 | `firefly-event-subscription` |

- 数据流转运行时复用规则引擎的 `rule.engine.input`，但使用独立消费组，与规则引擎运行时互不影响。
- `platform.event` 若未自动创建，需由运维预建（分区数按消息量评估）。

## 3. 配置项

数据流转中心无额外独立配置项，复用 firefly-rule 的 Kafka / PostgreSQL 配置。外部目标连接信息全部存放在每条规则的 `target_config` JSONB 中（MQTT broker/账号、RabbitMQ 连接、TSDB 地址与凭据、Webhook URL 等）。

- 外部凭据当前明文存于数据库，需保证数据库访问受控（与既有通知渠道、AppKey 口径一致）。
- MQTT / RabbitMQ 连接按 `broker+username` / `host+vhost+username` 缓存复用，断连后懒重建。

## 4. 日志定位

- 数据流转规则执行日志：关键字 `Data forward rule execution failed`（失败）、`Data forward rule enabled/disabled`（启停）。
- 事件订阅投递日志：关键字 `Event subscription delivery failed`（失败）、`Event subscription enabled/disabled`（启停）。
- 平台事件发布日志（尽力语义）：`Failed to publish platform event`、`Failed to publish DEVICE_CREATED event`。
- 日志统一输出到宿主机 `${APP_LOG_ROOT}/logs`，可用 `bash deploy.sh logs <service>` 查看。

## 5. 常见故障与排查

| 现象 | 排查 |
| --- | --- |
| 规则触发后一直失败（error_count 增长） | 查看日志 `Data forward rule execution failed`，检查目标地址/凭据/网络连通性、目标配置 JSON 字段是否完整 |
| MQTT/RabbitMQ 转发失败 | 确认外部 Broker 可达、账号密码正确、topic/exchange/routingKey 存在；MQTT 需 `broker` 用 `tcp://` 前缀 |
| TSDB 写入失败 | InfluxDB 需 `engine=INFLUXDB` 且 `org/bucket/token` 正确；TDengine 需 `engine=TDENGINE` 且 `user/password/database/sqlTemplate` 正确 |
| 事件订阅收不到推送 | 确认订阅已启用、事件类型匹配、目标 Webhook 可达；检查回调地址 HTTP 状态码是否 >= 400 |
| 事件订阅签名校验失败（消费方） | 签名算法为 `HMAC-SHA256(secret, rawBody)`，十六进制小写，通过 `X-Firefly-Signature` 传递 |

## 6. 监控告警

当前数据流转中心复用 firefly-rule 服务健康检查。运行状态可通过：

- 前端「数据流转规则 / 事件订阅」页面的触发/投递计数（成功、失败）观察。
- 建议对 `error_count` 持续增长或规则长时间无成功投递设置业务告警（后续可接入 Prometheus 指标）。

## 7. 回滚方式

- 数据流转中心为纯新增能力，回滚只需回退 `firefly-rule` / `firefly-device` / `firefly-web` 三个服务的镜像或代码。
- 新增 Flyway 迁移 `V8__init_data_forward_center.sql`（firefly-rule）与 `V40__init_data_forward_center_menu.sql`（firefly-system）为幂等 `IF NOT EXISTS` / `ON CONFLICT` 写入，回滚不要求删除表（如需彻底清理，可手动 `DROP TABLE data_forward_rules, event_subscriptions` 并删除对应菜单/权限记录）。
