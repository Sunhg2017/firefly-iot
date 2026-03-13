# 告警通知编排与接收组运维说明

## 1. 变更内容

本次交付包含以下运维对象：

- 系统模块新增接收组表与菜单补丁
- 系统模块新增接收组管理接口
- 支撑模块新增“可用通知方式”接口
- 规则模块新增 `notify_config` 结构化校验

相关迁移：

- `firefly-system/src/main/resources/db/migration/V22__init_alarm_recipient_groups.sql`

## 2. 部署步骤

1. 发布 `firefly-system`
2. 发布 `firefly-support`
3. 发布 `firefly-rule`
4. 发布 `firefly-web`

建议顺序：

- 先后端，后前端
- 先执行数据库迁移，再发布应用

## 3. 数据库检查

发布后确认以下对象存在：

- `alarm_recipient_groups`
- `alarm_recipient_group_members`
- `tenant_menu_configs` 中存在 `/alarm-recipient-groups`

可执行检查：

```sql
select table_name
from information_schema.tables
where table_name in ('alarm_recipient_groups', 'alarm_recipient_group_members');

select tenant_id, menu_key, label
from tenant_menu_configs
where menu_key = '/alarm-recipient-groups';
```

## 4. 配置依赖

### 4.1 通知方式来源

告警规则页的“通知方式”来自通知中心实时汇总，不需要额外配置字典。

运维需要保证：

- 平台默认渠道中至少有需要启用的方式
- 需要使用 Webhook 的租户，已经在租户列表维护了租户级 Webhook

### 4.2 用户数据依赖

接收组成员选择依赖系统用户：

- 用户必须属于当前租户
- 用户不能被删除
- 页面默认只提供可选用户作为接收人来源

## 5. 验证项

### 5.1 后端验证

```bash
mvn -pl firefly-system,firefly-support,firefly-rule -am -DskipTests compile
```

### 5.2 前端验证

```bash
cd firefly-web
npm run build
```

### 5.3 功能验证

1. 登录租户业务空间
2. 进入“规则告警 -> 告警接收组”，创建一个接收组
3. 进入“规则告警 -> 告警规则”，新建规则
4. 选择通知方式、接收组、指定人员
5. 保存后再次打开规则，确认通知配置正确回显

## 6. 常见问题

### 6.1 规则页没有可选通知方式

排查顺序：

- 检查平台默认渠道是否存在启用的 `EMAIL/SMS/PHONE/WECHAT/DINGTALK/IN_APP`
- 检查当前租户是否维护了启用状态的 Webhook
- 检查 `/api/v1/notifications/channel-types/available` 返回值

### 6.2 告警接收组页面没有可选用户

排查顺序：

- 检查当前租户下是否存在用户
- 检查用户是否仍然有效
- 检查 `/api/v1/users/options` 接口是否正常返回

### 6.3 保存规则提示通知配置非法

排查项：

- `channels` 是否为空
- `recipientGroupCodes` 与 `recipientUsernames` 是否同时为空
- 通知方式是否使用了受支持枚举

## 7. 日志定位

重点模块：

- `firefly-rule`：告警规则保存、通知配置校验
- `firefly-system`：接收组增删改查、成员解析
- `firefly-support`：可用通知方式聚合

关键关键词：

- `Alarm recipient group created`
- `Alarm recipient group updated`
- `Alarm recipient group deleted`
- `Alarm rule created`

## 8. 回滚说明

如果需要回滚应用版本：

- 可先回滚前端和应用版本
- 数据库新增表可保留，不影响旧版本读取其他模块

如果确需清理功能入口：

- 删除 `/alarm-recipient-groups` 菜单配置
- 停止访问新接口

不建议直接删除新表，除非确认没有业务数据。
