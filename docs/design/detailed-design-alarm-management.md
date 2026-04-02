# Firefly IoT 告警管理详细设计

## 1. 背景

告警模块原先存在三类明显断点：

1. 告警规则可以保存，但告警运行时没有形成稳定的触发闭环。
2. 告警通知编排已经结构化落库，但触发后并不能稳定解析并发送。
3. 前端阈值规则仍允许选择 `AVG/MAX/MIN/SUM/COUNT`，而实际阈值判断只对“最新值”有明确语义。

本次改造直接收口为当前唯一实现，不再保留旧口径、旧兼容分支或待接入状态说明。

## 2. 目标与范围

### 2.1 目标

1. 让属性上报进入 Kafka 后，告警规则能够真正触发、去重、恢复和升级。
2. 让 `alarm_rules.notify_config` 在运行时真正参与通知分发。
3. 统一前端表单、后端校验和运行时语义，阈值规则固定为“最新值”判断。
4. 强化租户隔离，避免跨租户读取、修改或删除他人告警规则与告警记录。

### 2.2 范围

- `firefly-device` 属性上报载荷规范化
- `firefly-rule` 告警运行时、规则校验、租户隔离、Flyway 索引
- `firefly-support` 通知模板平台兜底
- `firefly-data` 仪表盘告警字段修正
- `firefly-web` 告警规则表单阈值口径收口

## 3. 总体架构

### 3.1 触发链路

1. 设备上报 `PROPERTY_REPORT`
2. `firefly-device` 将 `params/properties` 包装载荷展开为标准属性 Map
3. 标准化后的消息写入 `KafkaTopics.RULE_ENGINE_INPUT`
4. `RuleRuntimeConsumer` 同时调用规则引擎运行时与告警运行时
5. `AlarmRuntimeService` 加载当前租户启用的告警规则并逐条评估
6. 命中后写入 `alarm_records`
7. 按 `notify_config` 解析通知方式、接收对象并调用通知中心

当前实现只对 `DeviceMessage.MessageType.PROPERTY_REPORT` 参与告警运行时计算。事件上报、生命周期消息等仍可进入规则引擎，但不会进入告警触发。

### 3.2 规则存储模型

`alarm_rules.condition_expr` 继续保存 `mode = STRUCTURED`、`version = 3` 的结构化 JSON。

示例：

```json
{
  "mode": "STRUCTURED",
  "version": 3,
  "groups": [
    {
      "level": "CRITICAL",
      "triggerMode": "ALL",
      "conditions": [
        {
          "type": "THRESHOLD",
          "metricKey": "temperature",
          "aggregateType": "LATEST",
          "operator": "GTE",
          "threshold": 95
        }
      ]
    }
  ]
}
```

约束：

1. 阈值触发 `THRESHOLD` 仅允许 `aggregateType = LATEST`
2. `COMPARE` 与 `ACCUMULATE` 继续使用统计窗口和聚合口径
3. `CONTINUOUS` 使用最近 N 次数值样本
4. `CUSTOM` 使用 SpEL 表达式

### 3.3 通知编排模型

`alarm_rules.notify_config` 保存结构化通知方案：

```json
{
  "version": 1,
  "channels": ["EMAIL", "IN_APP", "WEBHOOK"],
  "recipientGroupCodes": ["ARG001"],
  "recipientUsernames": ["alice"]
}
```

设计约束：

1. 规则里只保存通知方式类型，不保存具体通道 ID。
2. 接收组使用业务编码 `code`，接收人使用 `username`。
3. 保存规则时立即校验渠道是否存在、接收组是否存在、接收人是否有效。

## 4. 告警运行时设计

### 4.1 规则选择

运行时按以下条件加载规则：

1. `tenant_id` 匹配当前消息
2. `enabled = true`
3. `product_id` 为空或匹配消息产品
4. `device_id` 为空或匹配消息设备
5. 若规则限定了 `project_id`，则通过 `DeviceClient.getDeviceBasic` 校验项目归属

### 4.2 条件评估

#### 阈值触发

- 直接读取当前属性上报中的数值
- 不查历史窗口
- 仅比较最新值与阈值

#### 连续触发

- 从 `device_telemetry` 读取最近 N 个数值样本
- 全部满足比较条件才触发

#### 累计聚合

- 统计当前时间窗口内的 `AVG/MAX/MIN/SUM/LATEST`
- 对聚合结果做比较

#### 同环比

- 计算当前窗口与对标窗口的聚合值
- 支持同比/环比、绝对值/比例、上升/下降/双向

#### 自定义表达式

- 通过 SpEL 在标准上下文中执行
- 上下文包含 `message`、`payload`、`tenantId`、`deviceId`、`deviceName` 等字段

### 4.3 告警生命周期

开放态告警定义为：

- 同一 `tenant_id + alarm_rule_id + device_id`
- 状态属于 `TRIGGERED`、`CONFIRMED`、`PROCESSED`

运行规则：

1. 没有开放态记录且本次命中时，创建新告警。
2. 已有开放态记录且本次恢复时，自动关闭旧告警。
3. 已有开放态记录且本次命中更高等级时，自动关闭旧告警并生成更高等级新告警。
4. 已有开放态记录且本次仍是同等级命中时，不重复开单、不重复通知。

这个模型的目标是控制告警噪声，避免同等级持续抖动造成重复告警和重复发送。

## 5. 通知发送设计

### 5.1 运行时解析

`AlarmRuntimeService` 在规则命中后执行以下流程：

1. 解析 `notify_config`
2. 合并接收组成员与指定接收人，并按用户 ID 去重
3. 根据通知方式类型解析可用通道
4. 为每种通知方式构造收件人
5. 组装变量并调用通知中心

### 5.2 通道解析策略

当前按“通知方式类型”解析通道，策略如下：

1. 租户自有通道优先
2. 平台通道可作为 `EMAIL/SMS/PHONE/WECHAT/DINGTALK/IN_APP` 的默认来源
3. `WEBHOOK` 只使用当前租户启用的 Webhook，不使用平台兜底

### 5.3 模板解析策略

通知模板通过 `MessageTemplateService.getEntityByCodeWithPlatformFallback(...)` 查询：

1. 先查租户模板
2. 未命中时回退到平台模板
3. 模板缺失或禁用时记录失败日志与通知记录

这保证了规则触发时即使租户未单独维护模板，平台默认告警模板仍可投递。

## 6. 一致性与安全性设计

### 6.1 保存期校验

`AlarmService` 在保存规则时校验：

1. 结构化规则 JSON 合法
2. 等级块、触发语义、条件必填字段完整
3. `THRESHOLD` 只允许 `LATEST`
4. 通知方式枚举合法
5. 选择的通知方式确实存在启用通道
6. 接收组存在
7. 指定接收人存在且状态有效
8. `EMAIL/SMS/PHONE/IN_APP` 至少有可用接收目标

### 6.2 租户隔离

以下操作不再使用裸 `selectById`：

- 告警规则查询、更新、删除
- 告警记录查询、确认、处理、关闭

全部改为按 `tenant_id` 限定，避免越权操作。

### 6.3 删除策略

存在历史告警记录的规则禁止直接删除，只能停用并保留历史。这样可以保持值班审计链路可追溯。

## 7. 数据库与索引

新增 Flyway：

- `firefly-rule/src/main/resources/db/migration/V7__optimize_alarm_runtime.sql`

内容：

1. 为 `alarm_rules` 增加运行时范围查询索引
2. 为 `alarm_records` 增加开放态查找索引

目的是降低按租户、产品、设备、状态查找规则和开放告警的开销。

## 8. 前端交互收口

告警规则抽屉继续沿用结构化规则编辑器，但阈值触发区块已经收口为：

1. 不再让用户选择统计口径
2. 页面明确提示“阈值触发固定使用最新值”
3. 构造和预览阶段统一写回 `LATEST`

这样可以避免用户在前端配置出后端必然拒绝的无效规则。

## 9. 风险与清理要求

### 9.1 已知限制

1. 告警运行时当前只消费属性上报，不处理事件告警。
2. 同等级持续命中不会重复发送通知，这是有意的降噪策略。
3. 自定义表达式仍依赖运行时上下文字段命名，使用前需确认表达式口径。

### 9.2 旧数据清理

如果数据库中已经存在旧口径规则，需要运维侧清理或重新保存，重点包括：

1. `THRESHOLD` 条件中 `aggregateType != LATEST` 的旧数据
2. 引用了已停用通知方式、已删除接收组或已禁用用户的 `notify_config`

本次不在代码中保留旧口径兼容逻辑，历史脏数据应由数据库清理和规则重建解决。
