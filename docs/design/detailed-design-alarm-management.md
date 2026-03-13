# Firefly IoT 告警管理详细设计

## 1. 背景

告警模块已经拆分为两个菜单：

- 告警规则维护
- 告警处理

其中“告警规则维护”是规则管理员使用的配置入口，之前虽然已经从纯文本表达式改成了结构化配置，但仍有两个明显问题：

1. 一条规则下的条件组织方式不清晰，容易变成“条件和级别混在一起维护”。
2. 无法直观表达“全部满足才触发”“任意满足就触发”“至少 N 条满足才触发”等业务语义。

用户最新确认的交互模型是：

1. 一个告警规则可以维护多个“级别块”。
2. 每个级别块先选择告警级别，再选择触发语义。
3. 然后在该级别块下维护多条条件。
4. 当该级别块满足触发语义时，触发对应级别的告警。

本次设计以这个模型为唯一标准，不兼容旧的纯文本规则，也不保留旧的“每条条件单独选级别”的配置方式。

## 2. 目标与范围

### 2.1 目标

1. 告警规则维护页支持“规则组/级别块”式配置。
2. 每个级别块支持 `ALL`、`ANY`、`AT_LEAST` 三种触发语义。
3. 每条规则支持多种触发条件类型：
   - 阈值
   - 同比/环比
   - 连续触发
   - 累计聚合
   - 自定义表达式
4. 规则页优先通过项目、产品、设备、物模型属性联动选择，减少手工输入。
5. 后端保存时统一校验结构化 JSON，并自动推导规则主级别。
6. 不新增数据库字段，不做数据迁移。

### 2.2 范围

- `firefly-web` 告警规则维护页面
- `firefly-rule` 告警规则创建、更新校验
- 告警模块设计、运维、使用文档

### 2.3 非目标

1. 本次不改造告警处理流程。
2. 本次不实现新的实时规则执行引擎。
3. 本次不兼容旧纯文本 `conditionExpr`。

## 3. 总体方案

### 3.1 存储策略

数据库结构保持不变：

- 继续使用 `alarm_rules.condition_expr` 存储规则 JSON
- 继续使用 `alarm_rules.level` 存储规则主级别

其中：

- `condition_expr` 存储完整的结构化规则
- `level` 不再表示某一条条件的级别，而是该规则中最高严重等级的派生值

### 3.2 规则模型

本次统一使用 `version = 3` 的结构化规则：

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
          "operator": "GT",
          "threshold": 85
        }
      ]
    },
    {
      "level": "WARNING",
      "triggerMode": "AT_LEAST",
      "matchCount": 2,
      "conditions": [
        {
          "type": "THRESHOLD",
          "metricKey": "temperature",
          "aggregateType": "LATEST",
          "operator": "GT",
          "threshold": 75
        },
        {
          "type": "CONTINUOUS",
          "metricKey": "temperature",
          "operator": "GT",
          "threshold": 70,
          "consecutiveCount": 3
        }
      ]
    }
  ]
}
```

### 3.3 模型含义

#### 规则

一个告警规则是一个完整的维护单元，负责限定作用范围和承载多个级别块。

#### 级别块

每个级别块包含：

- `level`：该块触发后产生的告警级别
- `triggerMode`：该块内条件的组合方式
- `matchCount`：仅在 `AT_LEAST` 时使用
- `conditions[]`：该块下的具体条件

#### 触发语义

| 枚举 | 含义 | 说明 |
| --- | --- | --- |
| `ALL` | 全部满足 | 该块下所有条件都命中才触发 |
| `ANY` | 任意满足 | 该块下任意一条条件命中就触发 |
| `AT_LEAST` | 至少 N 条满足 | 该块下命中条件数达到 `matchCount` 才触发 |

### 3.4 支持的条件类型

| 类型 | 说明 | 关键字段 |
| --- | --- | --- |
| `THRESHOLD` | 阈值触发 | `metricKey`、`aggregateType`、`operator`、`threshold` |
| `COMPARE` | 同比/环比 | `metricKey`、`aggregateType`、`threshold`、`windowSize`、`windowUnit`、`compareTarget`、`changeMode`、`changeDirection` |
| `CONTINUOUS` | 连续触发 | `metricKey`、`operator`、`threshold`、`consecutiveCount` |
| `ACCUMULATE` | 累计聚合 | `metricKey`、`aggregateType`、`operator`、`threshold`、`windowSize`、`windowUnit` |
| `CUSTOM` | 自定义表达式 | `customExpr` |

## 4. 前端设计

### 4.1 页面结构

规则维护表单按以下顺序组织：

1. 规则名称、说明
2. 适用范围：项目、产品、设备
3. 规则主级别提示
4. 级别块列表
5. 每个级别块下的条件列表
6. 规则预览

### 4.2 交互原则

页面遵循“先级别、后语义、再条件”的配置顺序：

1. 新增一个级别块
2. 先选择该块告警级别
3. 再选择触发语义
4. 如为 `AT_LEAST`，填写满足条数
5. 最后维护该块下的具体条件

这样用户不需要先想“单条条件对应什么级别”，而是直接按业务级别块组织规则。

### 4.3 选择型交互

为满足仓库规则，页面优先使用选择型控件：

- 项目：来自 `projectApi.list`
- 产品：来自 `productApi.list`
- 设备：来自 `deviceApi.list`
- 指标：优先来自 `productApi.getThingModel(productId)` 返回的 `properties`

只有在产品物模型暂时没有可枚举属性时，才允许手工补充指标标识。

### 4.4 列表展示

规则列表展示以下信息，而不是原始 JSON：

1. 适用范围标签
2. 规则内覆盖的所有告警级别
3. 规则内覆盖的所有触发类型
4. 自动生成的自然语言摘要

这样维护人员可以直接判断规则内容，无需手动解析 `condition_expr`。

## 5. 后端设计

### 5.1 校验入口

`AlarmService.normalizeConditionExpr` 在创建和更新规则时统一执行校验和规范化。

### 5.2 校验规则

#### 根节点校验

1. `conditionExpr` 不能为空
2. 必须是合法 JSON
3. `mode` 必须为 `STRUCTURED`
4. 必须包含非空 `groups[]`

#### 级别块校验

1. 每个 `group` 必须是对象
2. `level` 必须是合法 `AlarmLevel`
3. `triggerMode` 必须在 `ALL` / `ANY` / `AT_LEAST` 中
4. `conditions[]` 必须非空
5. 若 `triggerMode = AT_LEAST`，则：
   - `matchCount` 必须为正整数
   - `matchCount` 不能大于该块条件总数

#### 条件校验

1. `type` 必须在支持范围内
2. `CUSTOM` 必须有 `customExpr`
3. 非 `CUSTOM` 必须有 `metricKey`
4. 各类型必填字段如下：

| 类型 | 必填字段 |
| --- | --- |
| `THRESHOLD` | `aggregateType`、`operator`、`threshold` |
| `COMPARE` | `aggregateType`、`threshold`、`windowSize`、`windowUnit`、`compareTarget`、`changeMode`、`changeDirection` |
| `CONTINUOUS` | `operator`、`threshold`、`consecutiveCount` |
| `ACCUMULATE` | `aggregateType`、`operator`、`threshold`、`windowSize`、`windowUnit` |
| `CUSTOM` | `customExpr` |

### 5.3 主级别推导

后端按优先级自动推导规则主级别：

`CRITICAL > WARNING > INFO`

规则主级别来源于所有级别块中的最高严重级别，用于：

- 列表筛选
- 统计
- 主标签展示

## 6. 关键流程

### 6.1 新建规则

1. 用户进入“告警规则维护”
2. 选择项目、产品、设备范围
3. 新增一个或多个级别块
4. 在每个级别块中选择级别和触发语义
5. 为每个级别块维护具体条件
6. 前端生成 `version = 3` 的结构化 JSON
7. 后端校验并保存
8. 后端自动推导规则主级别

### 6.2 编辑规则

1. 读取 `conditionExpr`
2. 反序列化为 `ruleGroups`
3. 回填级别块、触发语义和条件列表
4. 修改后重新保存

## 7. 设计取舍

### 7.1 为什么使用级别块而不是条件直接挂级别

因为真实业务更常见的表达方式是：

- 紧急级别：全部满足才触发
- 告警级别：任意满足就触发
- 通知级别：至少 2 条满足才触发

这类语义天然属于“级别块”，不适合让每条条件独立携带级别后再拼装。

### 7.2 为什么不新增数据库表

当前 `condition_expr` 已足够承载结构化 JSON，新增表会带来：

- 数据迁移
- 接口改造
- 回填脚本
- 联表复杂度

在当前阶段收益不高，因此继续采用单字段 JSON 方案。

### 7.3 为什么不兼容旧纯文本规则

用户明确说明尚未配置过旧告警规则，因此本次直接统一到新模型，可以：

- 降低解析分支复杂度
- 避免前后端同时兼容两套协议
- 让执行链路尽快稳定收敛到一个结构化协议

## 8. 风险与后续

### 8.1 已知风险

1. 下游如果仍假定 `conditionExpr` 是纯文本，将无法消费新规则。
2. 产品物模型不完整时，指标枚举能力会下降。
3. 当前交付聚焦“配置与校验”，执行链路仍需按本文协议实现消费。

### 8.2 后续建议

1. 在告警执行链路中补齐 `groups[]` 解析与命中计算。
2. 补充后端单元测试，覆盖 `ALL` / `ANY` / `AT_LEAST` 校验场景。
3. 在规则列表中增加按项目、产品、触发类型筛选能力。
