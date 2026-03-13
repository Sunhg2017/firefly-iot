# 规则引擎详细设计

## 1. 背景

`firefly-rule` 同时承载规则引擎、告警和跨租户共享三类能力，其中规则引擎负责“规则定义”和“规则动作定义”的管理。当前代码已经具备规则 CRUD、启停和动作配置存储能力，但原有设计文档与实现存在偏差，服务层也有几处明显不合理点：

- 规则详情、更新、启停、删除仅按 `id` 查询，缺少租户归属校验。
- 动作配置 `actionConfig` 直接写入 PostgreSQL JSONB，缺少服务层 JSON 预校验，错误会延迟到数据库层暴露。
- 列表页构建 VO 时每条规则都会单独查询一次动作，形成 N+1 查询。
- 返回对象暴露了 `createdBy` 这类前端不需要的内部主键信息。

## 2. 目标

- 规则读写必须限定在当前租户范围内。
- 动作配置在进入持久层前完成 JSON 合法性校验和标准化。
- 列表查询改成批量加载动作，避免不必要的数据库往返。
- 文档、接口和运维说明保持与当前实现一致。

## 3. 范围

本次设计覆盖：

- `RuleEngineService`
- `RuleAction` JSONB 映射
- `RuleEngineCreateDTO` / `RuleEngineUpdateDTO` / `RuleEngineVO`
- `RuleEngineServiceTest`
- 规则引擎设计、运维、使用文档

不包含完整规则执行器、SQL 解析器、动作投递链路和告警处理逻辑扩展。

## 4. 数据模型

### 4.1 `rules`

表结构来自 [`V1__init_rules.sql`](/E:/codeRepo/service/firefly-iot/firefly-rule/src/main/resources/db/migration/V1__init_rules.sql)：

```sql
CREATE TABLE rules (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    project_id      BIGINT,
    name            VARCHAR(256) NOT NULL,
    description     TEXT,
    sql_expr        TEXT NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'DISABLED',
    trigger_count   BIGINT NOT NULL DEFAULT 0,
    success_count   BIGINT NOT NULL DEFAULT 0,
    error_count     BIGINT NOT NULL DEFAULT 0,
    last_trigger_at TIMESTAMPTZ,
    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

说明：

- `tenant_id` 是规则归属边界，服务层所有单条读写都必须基于该字段做约束。
- `project_id` 用于项目维度筛选，但当前未在规则引擎接口中展开项目详情。
- `status` 仅保存启停状态，真正执行链路由后续运行时组件消费。

### 4.2 `rule_actions`

```sql
CREATE TABLE rule_actions (
    id            BIGSERIAL PRIMARY KEY,
    rule_id       BIGINT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    action_type   VARCHAR(32) NOT NULL,
    action_config JSONB NOT NULL DEFAULT '{}',
    sort_order    INT NOT NULL DEFAULT 0,
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

说明：

- `action_config` 以 JSONB 存储，不同动作类型的结构不同。
- 本次补充 `JsonbStringTypeHandler` 显式映射，保证读写一致。

## 5. 核心接口

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/api/v1/rules` | `rule:create` | 创建规则 |
| `POST` | `/api/v1/rules/list` | `rule:read` | 分页查询规则 |
| `GET` | `/api/v1/rules/{id}` | `rule:read` | 获取规则详情 |
| `PUT` | `/api/v1/rules/{id}` | `rule:update` | 更新规则 |
| `PUT` | `/api/v1/rules/{id}/enable` | `rule:enable` | 启用规则 |
| `PUT` | `/api/v1/rules/{id}/disable` | `rule:enable` | 停用规则 |
| `DELETE` | `/api/v1/rules/{id}` | `rule:delete` | 删除规则 |

接口约束：

- `name` 创建时必填，更新时如传入则不能为空且会自动去掉首尾空格。
- `sqlExpr` 创建时必填，更新时如传入则不能为空且会自动去掉首尾空格。
- `actions` 支持嵌套校验；`actionType` 不能为空。
- `actionConfig` 如为空，服务层会落成 `{}`；如非空，必须是合法 JSON。
- 规则详情与列表响应不再暴露 `createdBy`。

## 6. 关键设计

### 6.1 单条规则统一走租户归属校验

新增 `requireOwnedRule(id)`：

- 查询条件固定为 `id + tenantId`
- 查询不到时返回 `RULE_ENGINE_NOT_FOUND`
- 详情、更新、启停、删除都复用该逻辑

这样可以避免“猜到其他租户规则主键后直接访问”的越权风险。

### 6.2 动作配置在服务层做 JSON 标准化

新增 `normalizeActionConfig`：

- 空值或空白串归一化为 `{}`，避免前端未填动作配置时写入异常
- 非空值先用 `ObjectMapper.readTree(...)` 校验合法性
- 校验通过后再序列化成紧凑 JSON 字符串写入库中

这样数据库层只负责存储，不再承担输入校验职责。

### 6.3 列表批量加载动作

`listRules` 不再在 `result.convert(this::buildVO)` 中逐条查动作，而是：

1. 先查出当前页规则列表
2. 一次性按 `rule_id in (...)` 把动作全部查出
3. 按 `ruleId` 分组后回填到对应 VO

这一调整把列表场景从 `1 + N` 次动作查询收敛为固定 `1` 次。

### 6.4 JSONB 显式映射

`RuleAction.actionConfig` 显式声明：

- `@TableField(typeHandler = JsonbStringTypeHandler.class)`
- `@TableName(autoResultMap = true)`

避免依赖隐式推断，提升 PostgreSQL JSONB 读写稳定性。

## 7. 风险与权衡

- 当前规则接口仍然以数据库主键 `id` 作为路径标识。
  - 原因：现有表结构未提供独立业务唯一键，且前端主界面不直接展示该主键。
- 规则引擎仍然只提供“定义管理”，不执行 SQL。
  - 本次修复聚焦在已落地功能的正确性和可维护性，不扩展到完整执行运行时。
- `actionConfig` 仍使用 JSON 文本承载多种动作配置。
  - 原因：动作类型较多，短期内不适合强行拆成固定字段模型。

## 8. 验证

本次补充了 `RuleEngineServiceTest`，覆盖：

- 创建规则时的输入标准化和动作默认值
- 非法 JSON 动作配置拦截
- 详情查询必须走租户约束
- 列表查询批量加载动作
