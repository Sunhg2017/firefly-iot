# 规则引擎运维说明

## 1. 模块说明

规则引擎运行在 `firefly-rule` 模块中，当前已经包含完整运行时链路：

- Kafka 消费 `rule.engine.input`
- 装载租户启用规则
- 匹配 `FROM` / `WHERE`
- 执行动作
- 更新规则触发统计

规则运行时依赖以下外围服务：

- PostgreSQL：规则定义、动作配置、统计数据
- Kafka：消息接入与动作转发
- Nacos：配置中心与注册发现
- `firefly-device`：查询设备基础信息
- `firefly-support`：发送通知类动作
- `firefly-web`：提供租户侧规则管理页面

## 2. 部署与启动

### 2.1 本地启动

```bash
cd firefly-rule
mvn spring-boot:run
```

### 2.2 关键配置

配置文件位置：

- [application.yml](/E:/codeRepo/service/firefly-iot/firefly-rule/src/main/resources/application.yml)
- [application-prod.yml](/E:/codeRepo/service/firefly-iot/firefly-rule/src/main/resources/application-prod.yml)

重点检查：

- `spring.datasource.*`
- `spring.kafka.bootstrap-servers`
- `spring.cloud.nacos.discovery.*`
- `spring.cloud.nacos.config.*`
- `management.endpoints.web.exposure.include`

### 2.3 启动前检查

- Kafka 中已创建 `rule.engine.input`
- `firefly-device`、`firefly-support` 已注册到 Nacos
- `rules`、`rule_actions` 表迁移成功
- `firefly-rule` 能连通 PostgreSQL、Kafka、Nacos

## 3. 运行时依赖链路

### 3.1 上游输入

`firefly-rule` 只消费 `rule.engine.input`。该 topic 中的消息由 `firefly-device` 转发，消息体为 `DeviceMessage` JSON。

需要特别确认：

- `DeviceMessage.topic` 为真实设备上行 topic，而不是 `rule.engine.input`
- HTTP 直连接入场景已经补齐标准 topic

### 3.2 下游动作

- `KAFKA_FORWARD`
  - 由 `firefly-rule` 直接发送 Kafka
- `WEBHOOK`
  - 由 `firefly-rule` 直接发 HTTP
- `EMAIL` / `SMS`
  - 通过 `NotificationClient` 调 `firefly-support`
- `DEVICE_COMMAND`
  - 由 `firefly-rule` 投递到 `device.message.down`

### 3.3 管理台依赖

控制台规则页本次改为链路化视图，前端除了规则接口外，还会调用项目列表接口展示项目范围：

- `POST /api/v1/rules/list`
- `GET /api/v1/rules/{id}`
- `POST /api/v1/rules`
- `PUT /api/v1/rules/{id}`
- `POST /api/v1/projects/list`

运维排查页面异常时，需要同时确认：

- `firefly-web` 已正确代理 `firefly-rule` 与项目服务接口
- 项目列表接口可正常返回项目名称，否则页面只能退化显示项目编号
- 规则详情接口返回 `actions` 列表，否则前端无法回填动作卡片

## 4. 支持的动作配置

### 4.1 `KAFKA_FORWARD`

```json
{
  "topic": "runtime.alerts",
  "key": "${deviceId}",
  "payload": {
    "deviceName": "${deviceName}",
    "temp": "${temp}"
  }
}
```

### 4.2 `WEBHOOK`

```json
{
  "url": "https://ops.example.com/hooks/high-temp",
  "method": "POST",
  "headers": {
    "X-Rule": "${ruleName}"
  },
  "body": {
    "deviceName": "${deviceName}",
    "payload": "${payloadJson}"
  }
}
```

### 4.3 `EMAIL` / `SMS`

```json
{
  "channelId": 11,
  "templateCode": "alarm_notify",
  "recipient": "ops@example.com",
  "variables": {
    "deviceName": "${deviceName}",
    "temp": "${temp}"
  }
}
```

### 4.4 `DEVICE_COMMAND`

属性设置：

```json
{
  "commandType": "PROPERTY_SET",
  "payload": {
    "targetTemp": "${temp}"
  }
}
```

服务调用：

```json
{
  "commandType": "SERVICE_INVOKE",
  "serviceName": "reboot",
  "params": {
    "delaySeconds": 5
  }
}
```

### 4.5 当前限制

- `DB_WRITE` 暂不支持运行时执行，配置后会触发失败统计和错误日志。
- `WEBHOOK` 暂未内置重试、熔断和回退。

## 5. 监控与告警建议

建议接入以下观测项：

- `health`
  - 检查 PostgreSQL、Kafka、Nacos 是否可用
- `metrics`
  - JVM、Hikari、Tomcat、Kafka 客户端指标
- 应用日志
  - 重点关注 `RuleRuntimeConsumer`、`RuleRuntimeService`

建议配置日志关键字告警：

- `Failed to consume rule runtime message`
- `Rule action execution failed`
- `Failed to query device basic info for runtime rule`
- `Webhook invocation failed`
- `Notification dispatch failed`

## 6. 常见故障排查

### 6.0 控制台页面显示异常

排查顺序：

1. 检查浏览器网络请求里 `/api/v1/rules/list`、`/api/v1/rules/{id}`、`/api/v1/projects/list` 是否成功。
2. 若列表有数据但项目名称为空，检查项目服务是否可用。
3. 若编辑抽屉无法回填，检查详情接口返回是否包含 `sqlExpr` 与 `actions`。
4. 若动作模板填入后提交失败，检查 JSON 是否被手工改坏。

### 6.1 规则启用后没有触发

排查顺序：

1. 确认 `firefly-device` 是否确实向 `rule.engine.input` 发送消息。
2. 查看消息里的 `tenantId`、`topic`、`type`、`payload` 是否正确。
3. 确认规则 `status = ENABLED`。
4. 对照 `sqlExpr` 检查 `FROM` 是否匹配真实 topic/type。
5. 对照 `WHERE` 检查字段名是否和运行时上下文一致。

### 6.2 项目级规则一直不生效

排查顺序：

1. 确认规则配置了正确的 `projectId`。
2. 直接调用 `firefly-device` 内部接口检查设备 `projectId`：
   - `/api/v1/internal/devices/{id}/basic`
3. 检查 `firefly-rule` 到 `firefly-device` 的 Feign 调用是否正常。

### 6.3 `WEBHOOK` 动作失败

排查顺序：

1. 检查 `url` 是否可达、协议是否正确。
2. 检查请求头和 body 模板是否渲染出了空值。
3. 检查远端是否返回 `4xx/5xx`。

### 6.4 通知动作失败

排查顺序：

1. 检查 `channelId`、`templateCode` 是否有效。
2. 检查 `firefly-support` 是否正常注册和启动。
3. 检查通知渠道本身的配置与可达性。

### 6.5 设备命令没有真正下发

排查顺序：

1. 检查 `device.message.down` 是否收到消息。
2. 检查连接器对应协议的下行消费者是否在线。
3. 检查 `commandType` 是否为 `PROPERTY_SET` 或 `SERVICE_INVOKE`。

## 7. 数据库与迁移

核心迁移脚本：

- [V1__init_rules.sql](/E:/codeRepo/service/firefly-iot/firefly-rule/src/main/resources/db/migration/V1__init_rules.sql)
- [RuleEngineMapper.xml](/E:/codeRepo/service/firefly-iot/firefly-rule/src/main/resources/mapper/rule/RuleEngineMapper.xml)

核心表：

- `rules`
- `rule_actions`

关注字段：

- `status`
- `trigger_count`
- `success_count`
- `error_count`
- `last_trigger_at`

## 8. 回滚说明

如果需要回滚本次运行时补齐，必须同时回滚以下内容：

- `RuleRuntimeConsumer`
- `RuleRuntimeService`
- `RuleEngineMapper.xml` 中的统计更新 SQL
- `firefly-device` 的原始 topic 透传
- `firefly-device` 内部设备信息接口
- 文档同步变更

只回滚其中一部分，会造成规则界面状态和实际运行行为不一致。
