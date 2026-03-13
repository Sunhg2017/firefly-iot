# 规则引擎运维说明

## 1. 模块说明

规则引擎由 `firefly-rule` 模块提供，当前已落地的能力是规则定义管理：

- 规则 CRUD
- 规则启用 / 停用
- 规则动作配置管理
- 规则分页查询与详情查询

当前版本不包含独立的规则执行节点和动作投递 worker，规则表中的 `trigger_count`、`success_count`、`error_count`、`last_trigger_at` 主要为后续执行链路预留。

## 2. 部署与启动

### 2.1 本地启动

```bash
cd firefly-rule
mvn spring-boot:run
```

默认端口和基础依赖见 [`application.yml`](/E:/codeRepo/service/firefly-iot/firefly-rule/src/main/resources/application.yml)：

- HTTP: `9030`
- 数据库：PostgreSQL
- Redis：默认库 `0`
- Kafka：`firefly-rule` 消费组
- Nacos：读取 `firefly-rule.yml` / `firefly-rule-dev.yml`

### 2.2 Maven 验证

```bash
mvn -pl firefly-rule test
mvn -pl firefly-rule -DskipTests compile
```

## 3. 配置项

核心配置位于 [`application.yml`](/E:/codeRepo/service/firefly-iot/firefly-rule/src/main/resources/application.yml)。

重点关注：

- `spring.datasource.*`
  - 规则定义、动作、告警等元数据都落 PostgreSQL
- `spring.flyway.*`
  - 规则相关表由 Flyway 管理，历史表名为 `flyway_rule_history`
- `spring.kafka.*`
  - 当前模块已声明 Kafka 依赖和消费组，后续规则执行链路会复用
- `spring.cloud.nacos.*`
  - 生产环境应把敏感配置放在 Nacos，不建议保留示例地址
- `management.endpoints.web.exposure.include`
  - 默认暴露 `health,info,metrics,prometheus`

## 4. 数据库与迁移

规则引擎当前依赖以下迁移脚本：

- [`V1__init_rules.sql`](/E:/codeRepo/service/firefly-iot/firefly-rule/src/main/resources/db/migration/V1__init_rules.sql)
- [`V2__init_alarms.sql`](/E:/codeRepo/service/firefly-iot/firefly-rule/src/main/resources/db/migration/V2__init_alarms.sql)
- [`V3__init_notification_center.sql`](/E:/codeRepo/service/firefly-iot/firefly-rule/src/main/resources/db/migration/V3__init_notification_center.sql)
- [`V4__init_share_policies.sql`](/E:/codeRepo/service/firefly-iot/firefly-rule/src/main/resources/db/migration/V4__init_share_policies.sql)
- [`V5__init_message_templates.sql`](/E:/codeRepo/service/firefly-iot/firefly-rule/src/main/resources/db/migration/V5__init_message_templates.sql)

规则引擎核心表：

- `rules`
- `rule_actions`

运维注意：

- `rule_actions.rule_id` 使用 `ON DELETE CASCADE`
- `action_config` 是 JSONB，若业务请求传非法 JSON，当前版本会在服务层直接拒绝，不应再让数据库报语法错误

## 5. 监控与排查

### 5.1 建议关注指标

- `health`
  - 用于检查服务、数据库、Redis、Kafka 是否正常
- `metrics`
  - 建议接入 Prometheus 采集 JVM、Hikari、Tomcat 指标
- 应用日志
  - 规则创建、启停、删除都会输出结构化日志

### 5.2 常见故障

#### 规则详情/修改返回“规则不存在”

排查方向：

- 确认请求头中的租户上下文是否正确传入
- 确认规则是否属于当前租户
- 若数据库中记录存在但接口返回不存在，优先检查跨租户访问是否被正确拦截

#### 创建/更新规则时报“规则动作配置必须是合法 JSON”

排查方向：

- 检查 `actions[].actionConfig` 是否为合法 JSON 文本
- 常见问题是少双引号、少右括号，或把普通文本直接传进 JSONB 字段

#### 规则列表响应慢

当前版本已把动作加载从 N+1 查询收敛为批量加载。如果仍然偏慢，优先检查：

- PostgreSQL 对 `rules(tenant_id, status)`、`rule_actions(rule_id)` 索引是否存在
- 单租户规则总量是否异常增长
- 是否存在慢 SQL 或连接池拥塞

## 6. 日志定位

关键日志来自 `RuleEngineService`：

- `Rule created`
- `Rule enabled`
- `Rule disabled`
- `Rule deleted`

排查建议：

- 按规则名称、规则 `id` 和租户上下文联合筛查
- 对“创建成功但详情查不到”的场景，优先确认是否切换了租户

## 7. 回滚方式

若本次规则引擎整改需要回滚，应同时回滚以下内容：

- `RuleEngineService` 的租户归属校验和动作 JSON 预校验
- `RuleAction` 的 JSONB 显式 type handler 声明
- `RuleEngineServiceTest`
- 规则引擎三类文档

仅部分回滚可能造成接口行为与文档不一致。
