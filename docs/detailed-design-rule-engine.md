# Firefly-IoT 规则引擎模块 — 详细设计文档

> **版本**: v1.0.0  
> **日期**: 2026-02-27  
> **状态**: Draft  
> **关联**: [产品设计文档](./product-design.md) §8 规则引擎与数据流

---

## 目录

1. [模块概述](#1-模块概述)
2. [核心概念与术语](#2-核心概念与术语)
3. [数据库设计](#3-数据库设计)
4. [枚举定义](#4-枚举定义)
5. [API 接口设计](#5-api-接口设计)
6. [后端实现](#6-后端实现)
7. [前端交互设计](#7-前端交互设计)
8. [非功能性需求](#8-非功能性需求)

---

## 1. 模块概述

### 1.1 模块定位

规则引擎模块是 Firefly-IoT 的 **数据处理核心**，负责对设备上报的消息进行实时筛选、转换和动作触发。用户通过 SQL-like 语法定义规则条件，配置一个或多个动作（数据存储、消息转发、Webhook、告警通知等），实现设备数据的自动化处理。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| **规则 CRUD** | 创建、查看、编辑、删除规则 |
| **SQL 筛选** | 基于 SQL-like 语法定义数据筛选条件和字段映射 |
| **多动作** | 每条规则支持配置多个动作，按顺序执行 |
| **启用/禁用** | 运行中的规则可以随时禁用/启用 |
| **调试运行** | 模拟输入数据，验证规则和动作的执行结果 |
| **规则统计** | 规则触发次数、成功/失败计数、最近触发时间 |
| **数据权限** | 基于用户角色的项目级数据权限过滤 |

### 1.3 数据流

```
设备消息 ──► 规则引擎入口 ──► SQL 筛选 ──► 转换 ──► 动作(Action)
                                                      │
                              ┌────────────────────────┤
                              ▼            ▼           ▼           ▼
                         数据库写入    消息转发      Webhook     告警通知
                         (TDB/PG)   (Kafka)    (HTTP POST)  (邮件/短信)
```

---

## 2. 核心概念与术语

| 术语 | 英文 | 说明 |
|------|------|------|
| **规则 (Rule)** | Rule | 数据处理逻辑的基本单元，包含 SQL 筛选条件和动作列表 |
| **规则 SQL** | Rule SQL | SQL-like 表达式，定义数据源 (FROM)、筛选条件 (WHERE)、输出字段 (SELECT) |
| **动作 (Action)** | Rule Action | 规则匹配后执行的操作，如写数据库、转发消息、调用 Webhook |
| **动作类型** | Action Type | DB_WRITE / KAFKA_FORWARD / WEBHOOK / EMAIL / SMS / DEVICE_COMMAND |
| **动作配置** | Action Config | 动作的具体参数，如 Webhook URL、Kafka Topic、邮件地址等 |
| **触发统计** | Trigger Stats | 规则的执行统计：触发次数、成功次数、失败次数 |

---

## 3. 数据库设计

### 3.1 rules 表

```sql
CREATE TABLE rules (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
    project_id          BIGINT REFERENCES projects(id),
    name                VARCHAR(256) NOT NULL,
    description         TEXT,
    sql_expr            TEXT NOT NULL,
    status              VARCHAR(16) NOT NULL DEFAULT 'DISABLED',
    trigger_count       BIGINT NOT NULL DEFAULT 0,
    success_count       BIGINT NOT NULL DEFAULT 0,
    error_count         BIGINT NOT NULL DEFAULT 0,
    last_trigger_at     TIMESTAMPTZ,
    created_by          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rules_tenant ON rules(tenant_id);
CREATE INDEX idx_rules_project ON rules(project_id);
CREATE INDEX idx_rules_status ON rules(tenant_id, status);
```

### 3.2 rule_actions 表

```sql
CREATE TABLE rule_actions (
    id              BIGSERIAL PRIMARY KEY,
    rule_id         BIGINT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    action_type     VARCHAR(32) NOT NULL,
    action_config   JSONB NOT NULL DEFAULT '{}',
    sort_order      INT NOT NULL DEFAULT 0,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rule_actions_rule ON rule_actions(rule_id);
```

### 3.3 字段说明

**rules 表**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `sql_expr` | TEXT | 规则 SQL 表达式 |
| `status` | VARCHAR(16) | ENABLED / DISABLED |
| `trigger_count` | BIGINT | 总触发次数 |
| `success_count` | BIGINT | 成功次数 |
| `error_count` | BIGINT | 失败次数 |
| `last_trigger_at` | TIMESTAMPTZ | 最近触发时间 |

**rule_actions 表**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `action_type` | VARCHAR(32) | 动作类型枚举 |
| `action_config` | JSONB | 动作配置 JSON |
| `sort_order` | INT | 执行顺序 |
| `enabled` | BOOLEAN | 是否启用 |

---

## 4. 枚举定义

### 4.1 RuleEngineStatus

```java
ENABLED("ENABLED"),
DISABLED("DISABLED")
```

### 4.2 RuleActionType

```java
DB_WRITE("DB_WRITE"),               // 写入数据库
KAFKA_FORWARD("KAFKA_FORWARD"),     // 转发到 Kafka
WEBHOOK("WEBHOOK"),                 // HTTP Webhook
EMAIL("EMAIL"),                     // 邮件通知
SMS("SMS"),                         // 短信通知
DEVICE_COMMAND("DEVICE_COMMAND")    // 设备联动指令
```

---

## 5. API 接口设计

### 5.1 接口总览

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/rules` | `rule:create` | 创建规则 |
| POST | `/api/v1/rules/list` | `rule:read` | 分页查询 |
| GET | `/api/v1/rules/{id}` | `rule:read` | 查看详情（含动作列表） |
| PUT | `/api/v1/rules/{id}` | `rule:update` | 更新规则 |
| PUT | `/api/v1/rules/{id}/enable` | `rule:enable` | 启用规则 |
| PUT | `/api/v1/rules/{id}/disable` | `rule:enable` | 禁用规则 |
| DELETE | `/api/v1/rules/{id}` | `rule:delete` | 删除规则 |

### 5.2 创建规则

**Request**:
```json
{
  "name": "高温告警",
  "description": "温度超过50度触发告警",
  "projectId": 1,
  "sqlExpr": "SELECT deviceName, payload.temperature AS temp FROM 't_001/pk_smart_meter/+/PROPERTY_REPORT' WHERE payload.temperature > 50",
  "actions": [
    {
      "actionType": "WEBHOOK",
      "actionConfig": { "url": "https://example.com/alert", "method": "POST" },
      "sortOrder": 1
    },
    {
      "actionType": "EMAIL",
      "actionConfig": { "to": "admin@example.com", "subject": "高温告警" },
      "sortOrder": 2
    }
  ]
}
```

### 5.3 规则详情响应

```json
{
  "id": 1,
  "name": "高温告警",
  "sqlExpr": "SELECT ...",
  "status": "DISABLED",
  "triggerCount": 0,
  "successCount": 0,
  "errorCount": 0,
  "actions": [
    { "id": 1, "actionType": "WEBHOOK", "actionConfig": { ... }, "sortOrder": 1, "enabled": true },
    { "id": 2, "actionType": "EMAIL", "actionConfig": { ... }, "sortOrder": 2, "enabled": true }
  ]
}
```

---

## 6. 后端实现

### 6.1 文件结构

```
firefly-system/src/main/java/.../system/
├── entity/
│   ├── Rule.java
│   └── RuleAction.java
├── dto/rule_engine/
│   ├── RuleEngineVO.java
│   ├── RuleEngineCreateDTO.java
│   ├── RuleEngineUpdateDTO.java
│   ├── RuleEngineQueryDTO.java
│   └── RuleActionDTO.java
├── convert/
│   └── RuleEngineConvert.java
├── mapper/
│   ├── RuleEngineMapper.java
│   └── RuleActionMapper.java
├── service/
│   └── RuleEngineService.java
└── controller/
    └── RuleEngineController.java

firefly-common/src/main/java/.../common/enums/
├── RuleEngineStatus.java
└── RuleActionType.java
```

### 6.2 关键设计

- **规则与动作一对多**: 创建/更新规则时同步保存动作列表
- **动作配置**: JSONB 存储，不同动作类型的配置结构不同
- **启用/禁用**: 仅修改 `status` 字段，实际的规则执行由消息处理模块根据 status 判断
- **数据范围**: `listRules()` 标注 `@DataScope`
- **删除级联**: 删除规则时级联删除所有动作 (ON DELETE CASCADE)

---

## 7. 前端交互设计

### 7.1 规则列表页

- **搜索栏**: 关键字搜索 + 状态筛选
- **表格列**: 规则名称、SQL 表达式（截断）、状态、触发次数、成功/失败、最近触发、操作
- **操作按钮**: 新建规则、编辑、启用/禁用、删除
- **路由**: `/rule-engine`

### 7.2 新建/编辑弹窗

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 规则名称 | Input | ✅ | |
| 描述 | TextArea | ❌ | |
| SQL 表达式 | TextArea | ✅ | 代码编辑区域 |
| 动作列表 | 动态表单 | ≥1 | 类型 + 配置 JSON |

---

## 8. 非功能性需求

| 需求 | 指标 |
|------|------|
| **规则匹配延迟** | P99 < 50ms（单条规则） |
| **并发规则** | 单租户最多 100 条启用规则 |
| **动作执行** | 异步执行，不阻塞消息主流程 |
| **配额** | 每租户规则数上限由 `tenant_quotas.max_rules` 控制 |
