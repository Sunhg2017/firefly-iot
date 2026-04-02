# 告警通知编排与接收组运维说明

## 1. 变更内容

本次发布后，告警通知编排不再只是页面配置能力，而是正式参与告警触发链路：

1. 规则命中后会按 `notify_config` 解析通知方式
2. 接收组与指定接收人会在运行时真实解析
3. 模板先查租户，缺失时回退平台默认模板
4. 保存规则时会提前拦截无效通知配置

## 2. 影响模块

1. `firefly-system`
2. `firefly-support`
3. `firefly-rule`
4. `firefly-web`

## 3. 数据与配置检查

### 3.1 接收组数据

确认以下对象存在：

```sql
select table_name
from information_schema.tables
where table_name in ('alarm_recipient_groups', 'alarm_recipient_group_members');
```

### 3.2 通知通道

确认当前租户或平台存在启用通道：

```sql
select tenant_id, type, name, enabled
from notification_channels
where enabled = true
  and type in ('EMAIL', 'SMS', 'PHONE', 'WECHAT', 'DINGTALK', 'WEBHOOK', 'IN_APP')
order by type, tenant_id, id;
```

说明：

1. `WEBHOOK` 必须依赖租户自有启用通道
2. 其他类型可使用平台通道兜底

### 3.3 模板

确认告警模板存在：

```sql
select tenant_id, code, channel, enabled
from message_templates
where code in (
  'ALARM_EMAIL',
  'ALARM_SMS',
  'ALARM_PHONE',
  'ALARM_WECHAT',
  'ALARM_DINGTALK',
  'ALARM_WEBHOOK',
  'ALARM_IN_APP'
)
order by code, tenant_id;
```

如果租户没有模板，至少要保证平台模板存在且启用。

## 4. 发布验证

### 4.1 后端测试

```bash
mvn -pl firefly-rule,firefly-support -am test
```

### 4.2 前端构建

```bash
cd firefly-web
npm run build
```

### 4.3 功能验证

1. 创建接收组并保存成功
2. 创建带通知方式和接收对象的告警规则并保存成功
3. 触发对应告警
4. 在 `notification_records` 中看到成功或失败记录
5. 若租户未配置模板，仍能通过平台模板发送

## 5. 常见问题

### 5.1 页面没有可选通知方式

排查顺序：

1. 检查平台是否有启用的基础通道
2. 检查租户是否有启用的 Webhook
3. 检查 `/api/v1/notifications/channel-types/available` 返回值

### 5.2 保存规则时报“未配置可用渠道”

说明当前所选通知方式没有启用通道。

排查：

1. 查看 `notification_channels`
2. 确认通道 `enabled = true`
3. 确认通道类型与规则中选择的方式一致

### 5.3 保存规则时报接收对象不可用

排查：

1. 接收组是否被删除
2. 用户是否被禁用
3. 邮件、短信、电话接收人是否仍有邮箱或手机号

### 5.4 规则触发了，但通知仍失败

排查顺序：

1. 查看 `notification_records.error_message`
2. 查看模板是否存在且启用
3. 查看平台模板是否可兜底
4. 查看具体通道配置是否还能连通

## 6. 日志定位

重点日志关键词：

1. `Alarm notification dispatch failed`
2. `Notification send failed`
3. `Alarm rule created`
4. `Alarm rule updated`

定位建议：

1. `firefly-rule` 看规则解析和分发调用
2. `firefly-support` 看模板查找和实际发送失败原因
3. `firefly-system` 看接收组成员维护是否正常

## 7. 回滚说明

如需回滚：

1. 可先回滚 `firefly-web`
2. 再回滚 `firefly-rule` 与 `firefly-support`
3. 接收组表与通知模板数据可保留

注意：

回滚后若旧版本不具备当前保存期校验，仍可能读到历史脏配置。运维侧应优先清理无效接收组、失效通道和缺失模板数据。
