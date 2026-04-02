# 告警通知编排与接收组设计

## 1. 背景

告警通知编排原本只解决了“规则里如何保存通知方式和接收对象”，但没有真正解决两件关键事情：

1. 规则触发后如何解析为真实的通知投递目标
2. 租户未维护专属模板时如何保证告警仍能发出

本次改造把通知编排与告警运行时真正接通，并统一为当前正式实现。

## 2. 目标与范围

### 2.1 目标

1. 告警规则命中后按 `notify_config` 真正发出通知
2. 规则保存时提前拦截无效通知编排
3. 模板优先租户、缺失时回退到平台默认模板
4. 接收组、指定接收人、通知方式三者形成稳定闭环

### 2.2 范围

- 告警规则 `notify_config` 结构化存储与校验
- 接收组与指定接收人的运行时解析
- 通知方式到具体通道的解析
- 模板平台兜底

## 3. 数据模型

### 3.1 规则通知配置

`alarm_rules.notify_config` 仍保存结构化 JSON：

```json
{
  "version": 1,
  "channels": ["EMAIL", "IN_APP", "WEBHOOK"],
  "recipientGroupCodes": ["ARG7F3A19C2"],
  "recipientUsernames": ["alice", "bob"]
}
```

约束：

1. `channels` 只保存通知方式类型，不暴露具体通道 ID
2. `recipientGroupCodes` 使用接收组业务编码
3. `recipientUsernames` 使用用户名

### 3.2 接收组模型

接收组相关表保持不变：

1. `alarm_recipient_groups`
2. `alarm_recipient_group_members`

对外口径：

1. 组使用 `code`
2. 人使用 `username`
3. 内部联表仍然使用 `user_id`

## 4. 保存期校验设计

`AlarmService` 在创建和更新规则时，会对通知配置执行完整校验：

1. JSON 必须为对象
2. `channels`、`recipientGroupCodes`、`recipientUsernames` 必须是字符串数组
3. 只要配置了通知编排，至少选择一种通知方式
4. 至少选择一个接收组或指定接收人
5. 通知方式必须在支持枚举内
6. 所选通知方式必须存在启用的实际通道
7. 接收组必须真实存在
8. 指定接收人必须存在且为有效用户
9. `EMAIL` 至少有一个可用邮箱
10. `SMS/PHONE` 至少有一个可用手机号
11. `IN_APP` 至少有一个可用用户

这样可以把错误尽量前移到规则保存阶段，而不是等到告警触发时才失败。

## 5. 运行时解析设计

### 5.1 接收对象解析

`AlarmRuntimeService` 命中规则后：

1. 查询接收组成员
2. 查询指定接收人
3. 按 `userId` 去重合并

按通知方式构造接收目标：

1. `EMAIL` 使用邮箱列表
2. `SMS/PHONE` 使用手机号列表
3. `IN_APP` 使用用户 ID 列表
4. `WECHAT/DINGTALK/WEBHOOK` 不从规则中读取个人收件地址

### 5.2 通道解析

运行时通过通知方式类型动态选择通道：

1. 当前租户启用的同类型通道优先
2. 平台启用通道可作为 `EMAIL/SMS/PHONE/WECHAT/DINGTALK/IN_APP` 的默认来源
3. `WEBHOOK` 只允许使用租户自己的启用 Webhook

这样规则不会与某个具体通道实例强绑定，通知中心可以独立维护底层配置。

### 5.3 模板解析

`NotificationSender` 发送前调用：

`MessageTemplateService.getEntityByCodeWithPlatformFallback(tenantId, templateCode)`

规则：

1. 先查租户模板
2. 未命中时查平台模板
3. 模板不存在或已禁用时，当前通知记录标记失败

模板码映射：

1. `EMAIL -> ALARM_EMAIL`
2. `SMS -> ALARM_SMS`
3. `PHONE -> ALARM_PHONE`
4. `WECHAT -> ALARM_WECHAT`
5. `DINGTALK -> ALARM_DINGTALK`
6. `WEBHOOK -> ALARM_WEBHOOK`
7. `IN_APP -> ALARM_IN_APP`

## 6. 前端交互设计

告警规则页面继续遵循“业务侧只选方式、接收对象”的原则：

1. 用户不选择具体渠道实例
2. 通知方式列表由后端返回当前租户真正可用的方式
3. 接收组和指定接收人都使用选择控件，不暴露数据库主键
4. 页面实时展示通知摘要，便于保存前自检

## 7. 设计取舍

### 7.1 为什么不让规则直接绑定通道 ID

如果规则直接存通道 ID，会把通知中心的底层配置细节暴露给业务侧，也会导致通道调整时需要批量回写规则。

### 7.2 为什么在保存阶段做强校验

通知错误最容易在值班链路中造成漏报，因此宁可在保存时报错，也不让明显无效的规则进入运行时。

### 7.3 为什么模板要回退到平台

告警模板属于高复用基础能力。对于没有自定义模板的租户，平台默认模板应当保证系统最小可用。

## 8. 风险与清理要求

1. 旧规则如果引用了已删除接收组、已禁用用户或已停用通道，需要重新保存。
2. 如果历史上只维护了租户模板，没有平台默认模板，迁移期间要检查模板覆盖情况。
3. `WEBHOOK` 没有平台兜底，租户若未维护 Webhook，将无法发送 Webhook 通知。
