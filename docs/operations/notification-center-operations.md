# 通知中心运维说明

## 1. 模块说明

通知中心负责多渠道消息发送与发送记录留痕，当前支持：

- 邮件
- 短信
- 电话
- 企业微信机器人
- 钉钉机器人
- Webhook
- 站内信

通知中心后端位于 `firefly-support` 模块。

前端入口分为两处：

- 系统运维空间：`/notification`，维护平台默认通知渠道
- 租户业务空间：`/notification-records`，查看通知发送记录

## 2. 部署与依赖

## 2.1 依赖服务

- `firefly-support`
- PostgreSQL
- SMTP 服务（邮件渠道）
- HTTP 网关服务（短信/电话/Webhook）
- 企业微信机器人或钉钉机器人地址

## 2.2 数据库迁移

部署前确认 Flyway 已执行：

- `V2__init_notification_center.sql`
- `V3__init_in_app_messages.sql`
- `V7__extend_notification_channels.sql`
- `V8__merge_notification_templates_into_message_templates.sql`
- `V9__promote_platform_notification_channels.sql`

如果 `V8` 未执行，系统仍会残留历史 `notification_templates` 表。

## 3. 配置检查

## 3.1 邮件渠道

必填字段：

- `smtpHost`
- `username`
- `password`

建议同时配置：

- `smtpPort`
- `from`
- `useSsl`

## 3.2 短信/电话渠道

必填字段：

- `apiUrl`

建议配置：

- `provider`
- `token`
- `signName`
- `templateId`
- `callerId`（电话）

说明：

系统会向 `apiUrl` 发送标准 JSON 请求，请确保网关服务能识别以下字段：

- `recipient`
- `subject`
- `content`
- `templateCode`
- `provider`
- `signName`
- `templateId`
- `callerId`

## 3.3 企业微信/钉钉

必填字段：

- `webhookUrl`

可选字段：

- `messageType`
- `secret`
- `mentionedList`
- `mentionedMobileList`
- `atMobiles`
- `isAtAll`

## 3.4 站内信

站内信不依赖外部网关，推荐维护：

- `source`
- `level`
- `type`

## 4. 监控建议

重点监控以下指标：

- `notification_records` 每小时新增量
- `notification_records` 失败率
- `notification_records` 中 `FAILED` 数量趋势
- SMTP/HTTP 网关网络可达性
- 站内信表写入异常

建议至少增加两类告警：

1. 5 分钟内连续出现大量 `FAILED`
2. 某单一渠道 15 分钟无成功发送记录

## 5. 日常排查

## 5.1 发送失败排查路径

1. 打开租户业务空间的通知记录页面，查看失败原因
2. 根据渠道类型定位配置
3. 检查外部依赖连通性
4. 检查模板编码是否存在且启用
5. 检查接收方格式是否正确

## 5.2 常见问题

### 邮件发送失败

排查点：

- SMTP 主机、端口是否正确
- 账号是否开启 SMTP/授权码
- SSL/TLS 配置是否匹配

### 短信/电话发送失败

排查点：

- `apiUrl` 是否可达
- 网关是否接受标准 JSON
- Token 是否过期
- 接收方号码格式是否符合网关要求

### 机器人发送失败

排查点：

- `webhookUrl` 是否被重置
- 安全校验是否要求加签
- 消息格式是否被机器人平台限制

### 站内信未收到

排查点：

- 接收方是否传入合法用户 ID 列表
- 租户 ID 是否正确
- 用户是否属于当前租户

## 6. 日志定位

关键日志来源：

- `NotificationSender`
- `InternalNotificationController`
- `InAppMessageService`

建议按关键字检索：

- `Notification send failed`
- `notification channel not found`
- `notification template is missing or disabled`

## 7. 回滚方案

如本次改造需回滚：

1. 回滚应用版本到上一稳定版本
2. 保留数据库中的 `notification_records` 与 `in_app_messages` 数据
3. `V7__extend_notification_channels.sql` 可保留，不影响旧数据读取

注意：

本次已将模板体系合并为 `message_templates`。如果代码回滚到更早版本，需先确认是否还依赖历史 `notification_templates` 表。

如果本次版本已启用平台默认通知渠道，请同时确认是否需要回滚 `tenant_id = 0` 的平台默认渠道数据。

## 8. 验证命令

后端：

```bash
mvn -pl firefly-support -am -DskipTests compile
```

前端：

```bash
cd firefly-web
npm run build
```
