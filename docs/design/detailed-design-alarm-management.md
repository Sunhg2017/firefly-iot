# Firefly IoT 告警管理详细设计

## 1. 背景

现有告警能力已经拆分为“告警规则维护”和“告警处理”两个菜单，但规则维护页仍存在两个明显问题：

1. 触发条件只有 `conditionExpr` 原始文本，维护人员需要手写表达式，门槛高且容易出错。
2. 页面缺少项目、产品、设备、指标的联动选择，维护时需要记忆上下文，用户体验较差。

同时，业务侧已经提出更复杂的规则需求，包括：

- 同比/环比
- 连续触发
- 连续累计/窗口聚合
- 自定义表达式

## 2. 目标与范围

### 2.1 目标

1. 告警规则维护页支持结构化触发条件配置。
2. 支持至少 5 类触发方式：阈值、同比/环比、连续触发、累计聚合、自定义表达式。
3. 尽量通过项目、产品、设备、物模型属性联动选择，减少手工输入。
4. 保持数据库字段和接口兼容，不引入数据库迁移。
5. 后端在保存时对结构化条件做规范化和校验，避免无效规则入库。

### 2.2 范围

- `firefly-web` 告警规则维护页重构
- `firefly-rule` 告警规则创建/更新校验增强
- 告警模块设计、运维、使用文档更新

### 2.3 非目标

1. 本次不改造告警记录处理流程。
2. 本次不新增数据库字段。
3. 本次不在 `firefly-rule` 内新增实时执行引擎；当前交付聚焦“规则配置能力”和“保存校验能力”。

## 3. 总体方案

### 3.1 数据存储策略

保持数据库列 `alarm_rules.condition_expr` 不变，继续使用字符串存储。

本次统一要求：

- 所有告警规则都必须写入结构化 JSON
- 不再接受纯文本表达式
- `CUSTOM` 类型也必须以结构化 JSON 存储，表达式内容放在 `customExpr`

这样可以避免数据库迁移，同时让规则模型在前后端保持统一。

### 3.2 结构化条件模型

前端新增统一的条件模型，核心字段如下：

```json
{
  "mode": "STRUCTURED",
  "version": 1,
  "type": "COMPARE",
  "metricKey": "temperature",
  "aggregateType": "AVG",
  "operator": "GT",
  "threshold": 15,
  "windowSize": 1,
  "windowUnit": "HOURS",
  "compareTarget": "PREVIOUS_PERIOD",
  "changeMode": "PERCENT",
  "changeDirection": "UP"
}
```

其中：

- `mode=STRUCTURED` 表示这是结构化告警规则
- `version=1` 预留后续协议演进能力
- `type` 表示触发条件类别

### 3.3 支持的触发类型

| 类型 | 说明 | 关键字段 |
| --- | --- | --- |
| `THRESHOLD` | 阈值触发 | `metricKey`、`aggregateType`、`operator`、`threshold` |
| `COMPARE` | 同比/环比 | `metricKey`、`aggregateType`、`threshold`、`windowSize`、`compareTarget`、`changeMode`、`changeDirection` |
| `CONTINUOUS` | 连续触发 | `metricKey`、`operator`、`threshold`、`consecutiveCount` |
| `ACCUMULATE` | 累计聚合 | `metricKey`、`aggregateType`、`operator`、`threshold`、`windowSize`、`windowUnit` |
| `CUSTOM` | 自定义表达式 | `customExpr` |

## 4. 前端设计

### 4.1 页面结构

规则维护页从“简单表单 + 原始表达式”调整为“分区式维护表单”：

1. 基本信息：规则名称、说明、告警级别
2. 适用范围：项目、产品、设备
3. 触发方式：触发类型、指标、各类型特有参数
4. 规则预览：自动生成可读摘要

### 4.2 选择型交互

为遵守仓库交互规则，本次优先采用选择型控件：

- 项目：`projectApi.list`
- 产品：`productApi.list`
- 设备：`deviceApi.list`
- 指标：优先读取 `productApi.getThingModel(productId)` 中的 `properties`

只有在产品物模型没有属性可选时，才回退为手工输入指标标识。

### 4.3 列表展示优化

告警规则列表不再直接展示 `conditionExpr` 原文，而是展示：

1. 适用范围标签：项目 / 产品 / 设备
2. 触发方式标签：阈值触发、同比/环比等
3. 条件摘要：根据结构化条件自动生成自然语言描述

这样维护人员无需阅读 JSON 或脚本表达式即可判断规则含义。

## 5. 后端设计

### 5.1 保存校验

`AlarmService` 在创建和更新规则时增加 `normalizeConditionExpr`：

1. 空字符串直接拒绝
2. 非 JSON 内容直接拒绝
3. `mode != STRUCTURED` 的 JSON 直接拒绝
4. `mode = STRUCTURED` 时按类型校验必填字段
5. 校验通过后用 Jackson 重新序列化，写入标准化 JSON

### 5.2 校验规则

- `CUSTOM` 必须包含 `customExpr`
- 非 `CUSTOM` 必须包含 `metricKey`
- `THRESHOLD` 必须包含 `aggregateType`、`operator`、`threshold`
- `CONTINUOUS` 必须包含 `operator`、`threshold`、`consecutiveCount > 0`
- `ACCUMULATE` 必须包含 `aggregateType`、`operator`、`threshold`、`windowSize > 0`、`windowUnit`
- `COMPARE` 必须包含 `aggregateType`、`operator`、`threshold`、`windowSize > 0`、`windowUnit`、`compareTarget`、`changeMode`、`changeDirection`

### 5.3 一致性说明

- 数据库结构无变化
- 前端只生成结构化 JSON
- 后端只接受结构化 JSON
- `CUSTOM` 类型仅表示“结构化规则中的自定义表达式”，不是纯文本直存

## 6. 关键流程

### 6.1 新建规则

1. 用户进入“告警规则维护”
2. 选择项目/产品/设备范围
3. 选择触发方式
4. 如果已选产品，则自动拉取产品物模型属性
5. 填写阈值、窗口、连续次数等参数
6. 前端生成结构化 JSON 写入 `conditionExpr`
7. 后端校验并规范化保存

### 6.2 编辑规则

1. 读取 `conditionExpr`
2. 反序列化结构化 JSON 到对应表单
3. 用户修改后重新保存

## 7. 设计取舍

### 7.1 为什么不直接新增结构化字段

因为当前告警规则只在 CRUD 层使用 `conditionExpr`，新增数据库列会引入迁移、回填和接口兼容成本，收益不高。

### 7.2 为什么仍保留自定义表达式

虽然不再兼容纯文本直存，但仍有部分复杂逻辑不适合拆成标准表单字段，因此保留 `CUSTOM` 作为结构化规则中的兜底类型。

### 7.3 为什么要明确执行边界

当前仓库内 `conditionExpr` 主要用于规则维护与持久化，尚未在 `firefly-rule` 内看到对应的结构化执行引擎。也就是说：

- 本次已经支持规则“配置”和“保存校验”
- 若后续采集链路或规则执行链路要真正消费这些结构化条件，需要按本文定义解析 `conditionExpr`

## 8. 风险与后续

### 8.1 风险

1. 下游如果还假定 `conditionExpr` 是纯文本，将无法正确消费新规则。
2. 产品物模型为空时，维护人员仍需要手工补指标标识。
3. 若后续新增更多触发类型，需要同步扩展前端表单和后端校验。

### 8.2 建议后续工作

1. 在告警触发链路中统一解析 `STRUCTURED` 条件。
2. 为结构化条件补充后端单元测试和接口契约测试。
3. 在告警规则列表增加按项目/产品/触发类型筛选。
