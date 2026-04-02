# 规则引擎详细设计

## 1. 背景

`firefly-rule` 之前已经具备规则定义、启停和动作配置管理能力，但 `rule.engine.input` 仅有上游投递，没有真正的消费执行链路，导致：

- 启用规则后不会实际匹配设备消息。
- `trigger_count`、`success_count`、`error_count`、`last_trigger_at` 无法反映运行时结果。
- `FROM 'topic'` 场景拿不到真实上行 topic，因为设备侧转发时覆盖成了 Kafka 目标 topic。
- 项目级规则无法在运行时根据设备所属项目做过滤。

本次设计把规则运行时最小闭环补齐，做到“消息进入 `rule.engine.input` 后可被真正消费、匹配、执行和统计”。

## 2. 目标

- 在 `firefly-rule` 中增加 `rule.engine.input` Kafka 消费者。
- 支持按租户加载启用规则，并按项目、来源、条件做运行时过滤。
- 支持规则动作的真实执行与结果统计。
- 保持现有规则维护接口不变，兼容当前规则表结构。
- 对复杂链路补充必要注释，方便后续扩展更多动作类型。

## 3. 范围

本次覆盖：

- `firefly-rule` 运行时消费者与执行服务
- `rules` 触发/成功/失败统计回写
- `firefly-device` 到 `firefly-rule` 的上行上下文透传
- `firefly-connector` HTTP 直连接入的标准 topic 补齐
- `firefly-device` 内部设备基础信息接口
- `firefly-web` 规则管理页的链路化改版
- 设计、运维、使用三类文档同步刷新

本次暂不覆盖：

- 自定义 SQL 方言的完整解析器
- 规则执行缓存、分布式编译缓存、回放重跑

## 4. 运行时架构

### 4.1 执行链路

1. 设备消息进入 `firefly-connector` 或 `firefly-device`。
2. `firefly-device` 的 `MessageRouterService` 在处理属性/事件上报后，将消息投递到 Kafka `rule.engine.input`。
3. `firefly-rule` 的 `RuleRuntimeConsumer` 消费 `rule.engine.input`。
4. `RuleRuntimeService` 按 `tenantId` 加载所有启用规则及动作。
5. 规则运行时依次执行：
   - 解析 `sqlExpr`
   - 匹配 `FROM` 来源
   - 按需查询设备基础信息并校验 `projectId`
   - 计算 `WHERE`
   - 计算 `SELECT` 输出变量
   - 依次执行动作
6. 规则执行成功时累加 `trigger_count`、`success_count`，失败时累加 `trigger_count`、`error_count`，并刷新 `last_trigger_at`。

### 4.2 关键组件

- `RuleRuntimeConsumer`
  - Kafka 消费入口
  - 负责把字符串消息反序列化为 `DeviceMessage`
- `RuleRuntimeService`
  - 规则装载
  - SQL-like 表达式解析
  - SpEL 条件计算
  - 动作执行
  - 统计回写
- `InternalDeviceController`
  - 供 `firefly-rule` 通过 Feign 查询设备基础信息
- `DeviceClient`
  - 调整为访问 `/api/v1/internal/devices`

## 5. 数据与上下文设计

### 5.1 规则表

沿用现有 `rules`、`rule_actions` 表结构，并新增一次收口迁移：

- `V6__cleanup_unsupported_rule_actions.sql`
  - 删除历史 `DB_WRITE` 动作
  - 自动停用“清理后没有任何启用动作”的规则

新增运行时统计更新 SQL：

- `recordExecutionSuccess`
- `recordExecutionFailure`

这两个更新放在 `RuleEngineMapper.xml`，避免在 Java 中写内联 SQL。

### 5.2 运行时上下文

规则执行时构造统一上下文，供 `WHERE`、`SELECT` 和动作模板使用：

- `message`
- `messageId`
- `tenantId`
- `productId`
- `deviceId`
- `deviceName`
- `type`
- `topic`
- `payload`
- `payloadJson`
- `timestamp`
- `projectId`（查询到设备基础信息时补齐）
- `productName`
- `nickname`
- `payload` 中的一级字段也会平铺到上下文，便于直接写 `${temperature}`、`${code}`

### 5.3 真实来源 topic 透传

修复前，`firefly-device` 转发到规则引擎时把 `DeviceMessage.topic` 覆盖成了 `rule.engine.input`，导致规则无法基于真实来源匹配。

修复后：

- `MessageRouterService` 保留原始 `message.topic`
- 仅 Kafka 发送目标使用 `KafkaTopics.RULE_ENGINE_INPUT`
- `HttpProtocolAdapter` 直连属性/事件上报补齐标准 topic
  - `/sys/http/{deviceId}/thing/property/post`
  - `/sys/http/{deviceId}/thing/event/post`

## 6. 规则表达式设计

### 6.1 支持语法

当前运行时支持简化 SQL-like 语法：

```sql
SELECT expr1 AS alias1, expr2 AS alias2
FROM '/sys/*/thing/property/post'
WHERE payload.temperature >= 80 AND deviceName == 'dev-001'
```

也支持：

```sql
SELECT *
FROM 'PROPERTY_REPORT'
WHERE payload.code == 'overheat'
```

### 6.2 语义说明

- `FROM`
  - 支持真实 topic 或消息类型
  - 支持 `*`、`?` 通配
  - 同时用真实 `topic` 和 `type` 作为候选来源匹配
- `WHERE`
  - 使用 SpEL 执行
  - 自动把 `AND/OR/NOT` 归一化为 `&&/||/!`
  - 自动把 SQL 风格 `=`、`<>` 归一化为 `==`、`!=`
- `SELECT`
  - `SELECT *` 表示把整个运行时上下文直接提供给动作模板
  - 非 `*` 时只额外产出显式表达式结果
  - 没有写 `AS` 时会自动推导变量名

### 6.3 项目级过滤

如果规则配置了 `projectId`，运行时会通过 `DeviceClient` 查询设备基础信息并对比 `projectId`，只有匹配时才继续执行。

## 7. 动作执行设计

### 7.1 已支持动作

- `KAFKA_FORWARD`
  - 向任意 Kafka topic 发送渲染后的消息体
- `WEBHOOK`
  - 通过 JDK `HttpClient` 发送 HTTP 请求
- `EMAIL`
  - 通过 `NotificationClient` 调用 `firefly-support` 内部通知接口
- `SMS`
  - 通过 `NotificationClient` 调用 `firefly-support` 内部通知接口
- `DEVICE_COMMAND`
  - 组装下行 `DeviceMessage` 并投递到 `device.message.down`

### 7.2 动作收口

- 规则引擎当前只允许配置 5 种运行态动作：`KAFKA_FORWARD`、`WEBHOOK`、`EMAIL`、`SMS`、`DEVICE_COMMAND`
- `DB_WRITE` 不再出现在控制台和保存接口中
- 历史 `DB_WRITE` 记录通过 Flyway 迁移清理，不再继续保留“可配置但只会失败”的旧分支

### 7.3 动作模板渲染

动作配置中的字符串字段支持 `${...}` 模板，例如：

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

模板表达式同样走 SpEL 取值，可引用 `SELECT` 结果或上下文字段。

## 8. 关键设计取舍

- 不引入完整 SQL 引擎
  - 当前规则编辑页就是 SQL-like 文本，先用“受限语法 + SpEL”补齐运行时，复杂度和可维护性更平衡。
- 统计更新使用 XML SQL
  - 避免 `selectById -> Java 累加 -> updateById` 带来的并发覆盖问题。
- 项目过滤通过内部设备接口兜底
  - 没有强行修改所有消息模型和所有上游生产者，先用内部查询补齐项目维度。
- 规则更新改为显式覆盖可选字段
  - 控制台编辑时清空“项目范围 / 规则说明”必须真正落库为空，不能再被 `null` 忽略后残留旧值。
- 不再暴露未落地动作
  - `DB_WRITE` 既然没有运行时实现，就直接从配置入口和升级数据里移除，不再让用户创建必然失败的规则。

## 9. 风险与后续建议

- 当前规则在每次消息到达时都会解析 `sqlExpr`，后续可增加规则编译缓存。
- `WEBHOOK` 为同步调用，若远端慢会拖长单条消息处理时延，后续可引入异步派发或超时/重试策略。
- 目前 `EMAIL`、`SMS` 走统一通知中心，后续若增加 `PHONE`、`WECHAT`、`IN_APP`，建议在枚举和动作配置层统一扩展。
- 如果未来规则量增长明显，建议增加按租户缓存启用规则、按 topic/type 建索引分桶。
- `RuleRuntimeService` 现已改为注入 `HttpClient` Bean，后续若要统一代理、TLS 或超时策略，可直接在 Spring 配置层调整并复用单测覆盖。

## 10. 控制台交互收口

### 10.1 改造目标

原控制台页面以“规则引擎”孤立 CRUD 视角呈现，用户主要面对的是：

- 规则统计卡
- SQL 文本框
- 动作 JSON 输入框

这种表达方式和当前控制台已经收口的“设备接入 -> 设备管理 -> 告警/任务”链路不一致，容易让租户误以为这是一个脱离设备业务的独立模块。

本次前端交互改造的目标是：

- 页面主视角从“规则引擎”收口为“设备联动规则”
- 列表页直接呈现“来源 -> 条件 -> 动作 -> 结果”
- 新建/编辑抽屉按业务链路拆成“基本信息 / 消息匹配 / 执行动作”
- 保留后端 `sqlExpr` 存储模型，不新增双轨接口

### 10.2 页面信息架构

规则列表页调整为以下结构：

1. 顶部链路概览
   - 消息来源
   - 生效规则
   - 执行动作
   - 最近结果
2. 筛选区
   - 规则名称
   - 状态
   - 项目范围
3. 主表格
   - 规则信息
   - 消息入口
   - 匹配与输出
   - 动作链路
   - 运行结果

### 10.3 表单设计

创建和编辑规则时，不再把原始 SQL 文本框作为主入口，而是拆成结构化字段：

- `sourcePattern`
  - 对应 `FROM`
  - 前端使用可输入的自动完成控件，优先提供常见消息类型和 Topic 模板
- `matchCondition`
  - 对应 `WHERE`
- `outputExpr`
  - 对应 `SELECT`
- `actions`
  - 保留原动作 JSON 配置，但按动作卡片分组展示，并提供模板填充

前端在提交前将结构化字段重新拼装为 `sqlExpr`：

```sql
SELECT ...
FROM '...'
WHERE ...
```

这样可以在不改后端接口和表结构的前提下，让控制台交互与设备链路保持一致。

### 10.4 项目维度

规则本身已支持 `projectId`，但原页面没有体现项目范围。

本次控制台补齐：

- 列表筛选支持按项目过滤
- 基本信息区支持选择项目范围
- 表格展示项目名称，避免直接暴露内部主键作为主视角信息

## 11. 验证

本次新增或更新验证：

- `RuleRuntimeServiceTest`
  - 验证 `rule.engine.input` 的规则消费执行
  - 验证项目级规则过滤
  - 验证不支持动作的失败统计
- `MessageRouterServiceTest`
  - 验证转发到规则引擎时保留原始 topic
