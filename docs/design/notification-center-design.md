# 通知中心设计说明

## 1. 背景

通知模块原先存在三个明显问题：

1. 发送链路只真正支持邮件和 Webhook，短信等渠道会记录为成功但并未实际发送。
2. 内部调用依赖 `AppContextHolder` 的租户上下文，异步线程和跨服务调用下存在租户丢失风险。
3. 前端渠道维护和消息模板维护对渠道枚举支持不一致，且复杂表单交互不直观。

本次改造将通知中心收敛为“显式租户、多渠道发送、抽屉式配置”的实现方式。

## 2. 目标

- 支持 `EMAIL`、`SMS`、`PHONE`、`WECHAT`、`DINGTALK`、`WEBHOOK`、`IN_APP` 七类渠道。
- 修复租户隔离，避免通过主键直接跨租户读取通知渠道、模板和记录。
- 发送失败必须落失败记录，禁止“未发送但记录成功”。
- 将复杂表单统一改为抽屉交互，降低通知渠道和消息模板的维护成本。

## 3. 范围

### 后端

- `NotificationSender`
- `InternalNotificationController`
- `NotificationChannelService`
- `NotificationTemplateService`
- `MessageTemplateService`
- `NotificationRecordService`
- `InAppMessageService`
- Flyway 迁移 `V7__extend_notification_channels.sql`

### 前端

- `firefly-web/src/pages/notification/NotificationPage.tsx`
- `firefly-web/src/pages/message-template/MessageTemplatePage.tsx`
- `firefly-web/src/constants/notification.ts`

## 4. 核心设计

## 4.1 渠道模型

统一使用 `NotificationChannelType` 枚举约束渠道类型：

- `EMAIL`
- `SMS`
- `PHONE`
- `WEBHOOK`
- `DINGTALK`
- `WECHAT`
- `IN_APP`

渠道配置统一保存为 JSON，但在服务层按渠道类型做字段校验：

- 邮件：`smtpHost`、`username`、`password`
- Webhook：`url`
- 短信/电话：`apiUrl`
- 企业微信/钉钉：`webhookUrl`
- 站内信：允许为空，仅保存默认来源、级别等扩展信息

## 4.2 发送链路

发送入口拆分为两类：

1. 本地调用：`send(...)`
2. 跨服务调用：`sendForTenant(tenantId, operatorUserId, ...)`

跨服务入口必须显式传入租户 ID，避免异步线程中读取不到 `TenantContext`。

发送处理流程：

1. 初始化通知记录，状态为 `PENDING`
2. 按租户加载渠道并校验启用状态
3. 按租户加载通知模板并渲染变量
4. 根据渠道类型分发到对应发送实现
5. 成功则更新记录为 `SUCCESS`
6. 异常则更新记录为 `FAILED` 并截断错误信息
7. 无论成功或失败都落库通知记录

## 4.3 渠道实现策略

- `EMAIL`
  - 使用 `JavaMailSenderImpl`
  - 根据渠道 JSON 动态构造 SMTP 连接参数
- `WEBHOOK`
  - 按配置地址发起 HTTP 请求
  - 支持 `POST/GET` 和可选密钥头
- `SMS`
  - 通过统一 HTTP 网关发送
  - 请求体包含 `recipient/subject/content/templateCode/provider` 等字段
- `PHONE`
  - 复用统一 HTTP 网关模式
  - 支持 `callerId`
- `WECHAT`
  - 适配企业微信机器人 `text/markdown` 格式
- `DINGTALK`
  - 适配钉钉机器人 `text/markdown` 格式
- `IN_APP`
  - 解析接收方为用户 ID 列表
  - 通过 `InAppMessageService.sendBatch(...)` 直接落站内信

## 4.4 租户隔离

以下服务统一改为按 `tenantId + id/code` 查询：

- `NotificationChannelService`
- `NotificationTemplateService`
- `NotificationRecordService`
- `MessageTemplateService`

这样可以避免通过数据库主键跨租户读取或修改通知资源。

## 4.5 前端交互设计

### 通知渠道页

- 复杂配置表单由弹窗改为抽屉
- 渠道类型统一使用下拉选择
- 不同渠道展示不同字段，减少无关输入
- 渠道列表和发送记录列表分开展示

### 消息模板页

- 模板维护改为抽屉
- 渠道枚举与后端完全一致
- 支持模板预览
- 中文文案统一修正，避免乱码

## 5. 模板体系边界

仓库内目前存在两类模板：

1. `message_templates`
   - 面向业务消息模板维护页面
   - 适合租户日常自定义模板
2. `notification_templates`
   - 面向系统通知中心发送链路
   - 适合系统事件、预置通知模板

本次没有合并两张表，但统一了渠道能力和租户校验，并在文档中明确边界，避免维护侧误用。

## 6. 数据库变更

新增 `V7__extend_notification_channels.sql`：

- 更新渠道字段注释，声明支持的完整渠道集合
- 补充电话、企业微信、钉钉、站内信默认通知模板

## 7. 风险与取舍

- 当前短信和电话仍采用“统一 HTTP 网关协议”，未绑定某一家云厂商 SDK。这样扩展性更好，但要求网关服务按约定接收请求。
- `notification_templates` 与 `message_templates` 仍并存，当前通过边界说明和 UI 收敛降低混淆，后续可再评估合并方案。
- 企业微信和钉钉测试接口当前做的是地址有效性校验，不会真正发送测试消息，避免误触发群通知。
