# 规则引擎使用说明

## 1. 适用角色

- 租户管理员
- 项目管理员
- 具有 `rule:*` 权限的运维或集成人员

## 2. 功能概览

规则引擎现在不仅可以维护规则，还会真正消费设备消息并执行动作。

控制台页面按联动链路拆成四个主视角：

- 消息来源
- 命中条件
- 执行动作
- 运行结果

一条规则由三部分组成：

- 基本信息
  - 名称、描述、项目范围
- 消息匹配
  - 消息来源、命中条件、输出字段
- 动作列表
  - 一个或多个动作，按 `sortOrder` 顺序执行

支持的动作类型：

- `KAFKA_FORWARD`
- `WEBHOOK`
- `EMAIL`
- `SMS`
- `DEVICE_COMMAND`

## 3. 规则表达式写法

### 3.1 基本格式

```sql
SELECT expr1 AS alias1, expr2 AS alias2
FROM 'source'
WHERE condition
```

### 3.2 `FROM` 的可选值

可以写真实 topic：

```sql
FROM '/sys/*/thing/property/post'
```

也可以写消息类型：

```sql
FROM 'PROPERTY_REPORT'
```

支持通配符：

- `*`：任意长度
- `?`：单个字符

### 3.3 `WHERE` 条件

支持常见比较和逻辑表达式，例如：

```sql
WHERE payload.temperature >= 80 AND deviceName == 'dev-001'
```

可直接使用的字段包括：

- `deviceId`
- `deviceName`
- `topic`
- `type`
- `payload.xxx`
- `projectId`
- `nickname`
- `productName`

### 3.4 `SELECT` 输出变量

`SELECT` 计算出的字段可以在动作配置里通过 `${...}` 引用，例如：

```sql
SELECT payload.temperature AS temp, deviceName
FROM 'PROPERTY_REPORT'
WHERE payload.temperature >= 80
```

后续动作里就可以使用：

- `${temp}`
- `${deviceName}`

如果写 `SELECT *`，表示直接使用整份运行时上下文。

## 4. 创建规则

### 4.1 控制台操作

在“设备联动规则”页面点击“新建联动规则”后，按抽屉中的三个分区填写：

1. 基本信息
   - 规则名称
   - 项目范围
   - 规则说明
2. 消息匹配
   - 消息来源
   - 命中条件
   - 输出字段
3. 执行动作
   - 动作类型
   - 动作配置 JSON

页面会根据“消息来源 / 命中条件 / 输出字段”自动生成规则表达式预览。

### 4.2 接口

`POST /api/v1/rules`

### 4.3 示例

```json
{
  "name": "高温告警联动",
  "description": "温度超过 80 度时推送通知并转发 Kafka",
  "projectId": 101,
  "sqlExpr": "SELECT payload.temperature AS temp, deviceName FROM '/sys/*/thing/property/post' WHERE payload.temperature >= 80",
  "actions": [
    {
      "actionType": "KAFKA_FORWARD",
      "sortOrder": 1,
      "enabled": true,
      "actionConfig": "{\"topic\":\"runtime.alerts\",\"key\":\"${deviceId}\",\"payload\":{\"deviceName\":\"${deviceName}\",\"temp\":\"${temp}\"}}"
    },
    {
      "actionType": "EMAIL",
      "sortOrder": 2,
      "enabled": true,
      "actionConfig": "{\"channelId\":11,\"templateCode\":\"alarm_notify\",\"recipient\":\"ops@example.com\",\"variables\":{\"deviceName\":\"${deviceName}\",\"temp\":\"${temp}\"}}"
    }
  ]
}
```

### 4.4 注意事项

- `name`、`sqlExpr` 必填。
- 新建规则默认状态为 `DISABLED`。
- `actionConfig` 必须是合法 JSON 字符串。
- 一条规则可以配置多个动作，按顺序执行。
- 若规则配置了 `projectId`，只有该项目下的设备消息才会命中。
- 控制台中的“输出字段”为空时，默认按 `SELECT *` 处理。
- 选择动作类型后，可直接使用“填入模板”生成对应 JSON 模板。
- 编辑规则时，清空“项目范围”或“规则说明”会真正保存为空，不会再残留旧值。
- 更新接口与控制台保存都会提交完整动作列表；如果不带 `actions` 或把动作删空，后端会直接拒绝保存。
- 升级到当前版本后，历史 `DB_WRITE` 动作会被自动清理；若规则因此没有任何启用动作，系统会自动把该规则停用，需补齐有效动作后再启用。

## 5. 常见动作配置

### 5.1 Kafka 转发

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

### 5.2 Webhook

```json
{
  "url": "https://ops.example.com/hooks/high-temp",
  "method": "POST",
  "headers": {
    "X-Rule": "${deviceName}"
  },
  "body": {
    "deviceName": "${deviceName}",
    "temp": "${temp}"
  }
}
```

### 5.3 邮件或短信

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

### 5.4 设备命令

属性下发：

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

## 6. 查询、启停和删除

### 6.1 列表查询

`POST /api/v1/rules/list`

示例：

```json
{
  "pageNum": 1,
  "pageSize": 20,
  "keyword": "高温",
  "status": "ENABLED",
  "projectId": 101
}
```

控制台支持的筛选项：

- 规则名称
- 状态
- 项目范围

### 6.2 详情查询

`GET /api/v1/rules/{id}`

### 6.3 启用规则

`PUT /api/v1/rules/{id}/enable`

### 6.4 停用规则

`PUT /api/v1/rules/{id}/disable`

### 6.5 删除规则

`DELETE /api/v1/rules/{id}`

## 7. 运行结果怎么看

规则真正命中并执行后，会更新以下字段：

- `triggerCount`
- `successCount`
- `errorCount`
- `lastTriggerAt`

理解方式：

- `triggerCount`
  - 规则命中并进入动作执行的次数
- `successCount`
  - 所有动作都执行成功的次数
- `errorCount`
  - 至少一个动作执行失败的次数

控制台列表页会直接把这些结果整理为：

- 命中次数
- 成功次数
- 失败次数
- 最近触发时间

## 8. 常见问题

### 8.1 为什么规则启用了但没有触发？

重点检查：

- `FROM` 是否匹配真实 topic 或消息类型
- `WHERE` 字段名是否正确
- 设备是否属于规则限定的项目
- 动作配置是否为合法 JSON

### 8.2 为什么触发了但 `errorCount` 在增加？

通常是动作执行失败，常见原因：

- `WEBHOOK` 地址不可达
- `EMAIL` / `SMS` 的 `channelId`、`templateCode` 无效
- `DEVICE_COMMAND` 的 `commandType` 不正确
- 规则里没有任何启用动作

### 8.3 为什么按 topic 写规则时不生效？

请直接按照设备真实上行 topic 编写，例如：

- MQTT / 通用协议：`/sys/{productKey}/{deviceName}/thing/property/post`
- HTTP 直连属性上报：`/sys/http/{deviceId}/thing/property/post`
- HTTP 直连事件上报：`/sys/http/{deviceId}/thing/event/post`
