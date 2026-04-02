# 告警管理运维说明

## 1. 变更概览

本次发布让告警模块从“规则可配”升级为“属性上报可实际触发”：

1. 属性上报进入 Kafka 后会同时进入告警运行时。
2. 告警支持开放态去重、自动恢复关闭和高等级升级重开。
3. 告警命中后会按 `notify_config` 解析通知方式并调用通知中心。
4. 阈值规则统一固定为“最新值”口径，前后端已同步收口。

## 2. 影响模块

需要联动发布以下模块：

1. `firefly-device`
2. `firefly-rule`
3. `firefly-support`
4. `firefly-data`
5. `firefly-web`

## 3. 数据库变更

### 3.1 Flyway

`firefly-rule` 新增迁移：

- `firefly-rule/src/main/resources/db/migration/V7__optimize_alarm_runtime.sql`

内容：

1. `alarm_rules` 运行时范围查询索引
2. `alarm_records` 开放态记录查找索引

### 3.2 发布后检查

```sql
select indexname
from pg_indexes
where tablename in ('alarm_rules', 'alarm_records')
  and indexname in ('idx_alarm_rules_runtime_scope', 'idx_alarm_records_runtime_open');
```

## 4. 发布前准备

### 4.1 通知配置检查

至少确认以下数据有效：

1. 告警规则使用到的通知方式存在启用通道
2. `WEBHOOK` 使用场景下，租户自身已经维护启用的 Webhook 通道
3. 邮件、短信、电话、站内信接收对象具备可用邮箱、手机号或用户 ID
4. 告警模板存在

模板策略：

1. 先查租户模板
2. 租户未维护时使用平台模板

### 4.2 旧数据清理

如数据库里已有旧规则，请先检查并清理：

1. `THRESHOLD` 条件中 `aggregateType != 'LATEST'`
2. `notify_config` 中引用已停用通道、已删除接收组或已禁用用户的数据

本次实现不保留旧数据兼容逻辑，脏数据会导致保存失败或运行时跳过通知。

## 5. 发布步骤

1. 执行 `firefly-rule` 的 Flyway 迁移
2. 发布 `firefly-device`
3. 发布 `firefly-support`
4. 发布 `firefly-rule`
5. 发布 `firefly-data`
6. 发布 `firefly-web`

建议顺序：

1. 先数据库
2. 再后端服务
3. 最后前端

## 6. 验证项

### 6.1 后端测试

```bash
mvn -pl firefly-rule,firefly-support,firefly-device -am test
```

### 6.2 前端构建

```bash
cd firefly-web
npm run build
```

### 6.3 功能回归

建议至少验证以下场景：

1. 新建阈值告警规则时，页面不再允许选择 `AVG/MAX/...`，只提示“最新值”。
2. 设备发送属性上报后，满足规则时生成告警记录。
3. 告警持续命中同等级时不重复开单。
4. 条件恢复后开放态告警自动关闭。
5. 更高等级条件命中后旧记录自动关闭并生成新记录。
6. 告警命中后通知记录成功落库。
7. 仪表盘最近告警和待处理数量显示正常。

## 7. 日志与定位

### 7.1 关键日志

重点关注以下日志关键词：

- `Alarm triggered`
- `Alarm closed automatically`
- `Alarm runtime execution failed`
- `Alarm runtime failed unexpectedly`
- `Notification send failed`

### 7.2 模块定位

1. `firefly-device`
   - 看属性上报是否被规范化并投递到 `RULE_ENGINE_INPUT`
2. `firefly-rule`
   - 看规则是否被匹配、是否创建/关闭告警、是否跳过通知
3. `firefly-support`
   - 看模板是否回退到平台、通知是否发送失败
4. `firefly-data`
   - 看仪表盘 SQL 是否返回最近告警与待处理数量

## 8. 常见问题排查

### 8.1 规则保存成功，但始终不触发

排查顺序：

1. 确认设备发送的是 `PROPERTY_REPORT`，不是事件上报
2. 确认消息中的属性名与规则 `metricKey` 一致
3. 确认属性值是可比较的数值
4. 确认规则范围的项目、产品、设备没有配错
5. 确认阈值规则使用的是最新值，不再指望平均值或累计值

### 8.2 规则触发了，但没有通知

排查顺序：

1. 查看规则 `notify_config` 是否为空
2. 查看对应通知方式是否存在启用通道
3. 查看接收组、接收人是否仍然有效
4. 查看接收人是否具备邮箱、手机号或站内信目标
5. 查看平台或租户模板是否存在且启用
6. 查看 `notification_records` 中的失败原因

### 8.3 仪表盘最近告警为空或字段错位

排查顺序：

1. 确认 `alarm_records` 中确实已有数据
2. 确认 `firefly-data` 已发布到本次版本
3. 检查服务日志中是否存在 `Failed to query recent alarms`

### 8.4 老规则打开后口径不一致

原因通常是历史规则仍保留旧统计口径或旧通知配置。

处理方式：

1. 重新在前端打开并保存规则
2. 如旧数据已无法通过前端修正，直接清理数据库中的脏规则后重建

## 9. 回滚说明

如需回滚应用版本，建议整体回滚以下模块：

1. `firefly-web`
2. `firefly-data`
3. `firefly-rule`
4. `firefly-support`
5. `firefly-device`

说明：

1. `V7__optimize_alarm_runtime.sql` 只新增索引，保留不会影响旧版本运行。
2. 若回滚到旧版本，前端与文档口径会重新落后于当前运行链路，需同步回滚操作手册和培训说明。
