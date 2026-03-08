# Firefly-IoT 告警管理模块 — 详细设计文档

> **版本**: v1.0.0  
> **日期**: 2026-02-27  
> **状态**: Draft  
> **关联**: [产品设计文档](./product-design.md) §8 规则引擎、§12 安全体系

---

## 目录

1. [模块概述](#1-模块概述)
2. [核心概念与术语](#2-核心概念与术语)
3. [数据库设计](#3-数据库设计)
4. [枚举定义](#4-枚举定义)
5. [告警生命周期](#5-告警生命周期)
6. [API 接口设计](#6-api-接口设计)
7. [后端实现](#7-后端实现)
8. [前端交互设计](#8-前端交互设计)
9. [非功能性需求](#9-非功能性需求)

---

## 1. 模块概述

### 1.1 模块定位

告警管理模块负责 **告警规则定义** 和 **告警记录管理**。当规则引擎或设备事件触发告警条件时，系统生成告警记录，支持告警确认、处理、关闭等全生命周期管理。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| **告警规则** | 定义告警条件、级别、通知方式 |
| **告警记录** | 记录每次告警触发的详情 |
| **告警确认** | 运维人员确认告警，记录确认人和时间 |
| **告警处理** | 填写处理备注，标记为已处理 |
| **告警统计** | 按级别、状态、设备、时间段统计告警 |
| **数据权限** | 基于项目级数据权限过滤 |

### 1.3 模块依赖

```
┌──────────────────────────────────────────────┐
│                告警管理模块                     │
│                                               │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ 告警规则  │  │ 告警记录  │  │ 告警统计   │  │
│  └──────────┘  └──────────┘  └────────────┘  │
└──────────────────┬───────────────────────────┘
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ 规则引擎  │ │ 设备管理  │ │ 产品管理  │
  └──────────┘ └──────────┘ └──────────┘
```

---

## 2. 核心概念与术语

| 术语 | 英文 | 说明 |
|------|------|------|
| **告警规则** | Alarm Rule | 定义告警触发条件、级别、关联产品/设备 |
| **告警记录** | Alarm Record | 告警触发后生成的记录实例 |
| **告警级别** | Alarm Level | CRITICAL / WARNING / INFO |
| **告警状态** | Alarm Status | TRIGGERED / CONFIRMED / PROCESSED / CLOSED |
| **告警确认** | Acknowledge | 运维人员确认已知晓该告警 |

---

## 3. 数据库设计

### 3.1 alarm_rules 表

```sql
CREATE TABLE alarm_rules (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
    project_id          BIGINT REFERENCES projects(id),
    name                VARCHAR(256) NOT NULL,
    description         TEXT,
    product_id          BIGINT REFERENCES products(id),
    device_id           BIGINT REFERENCES devices(id),
    level               VARCHAR(16) NOT NULL DEFAULT 'WARNING',
    condition_expr      TEXT NOT NULL,
    enabled             BOOLEAN NOT NULL DEFAULT TRUE,
    notify_config       JSONB DEFAULT '{}',
    created_by          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.2 alarm_records 表

```sql
CREATE TABLE alarm_records (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
    alarm_rule_id       BIGINT REFERENCES alarm_rules(id),
    product_id          BIGINT REFERENCES products(id),
    device_id           BIGINT REFERENCES devices(id),
    project_id          BIGINT REFERENCES projects(id),
    level               VARCHAR(16) NOT NULL,
    status              VARCHAR(16) NOT NULL DEFAULT 'TRIGGERED',
    title               VARCHAR(512) NOT NULL,
    content             TEXT,
    trigger_value       TEXT,
    confirmed_by        BIGINT,
    confirmed_at        TIMESTAMPTZ,
    processed_by        BIGINT,
    processed_at        TIMESTAMPTZ,
    process_remark      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 4. 枚举定义

### 4.1 AlarmLevel

```java
CRITICAL("CRITICAL"),   // 紧急
WARNING("WARNING"),     // 警告
INFO("INFO")            // 通知
```

### 4.2 AlarmStatus

```java
TRIGGERED("TRIGGERED"),     // 已触发
CONFIRMED("CONFIRMED"),     // 已确认
PROCESSED("PROCESSED"),     // 已处理
CLOSED("CLOSED")            // 已关闭
```

---

## 5. 告警生命周期

```
触发条件匹配 → TRIGGERED
    │
    ▼ 运维确认
CONFIRMED (记录 confirmed_by + confirmed_at)
    │
    ▼ 填写处理备注
PROCESSED (记录 processed_by + processed_at + process_remark)
    │
    ▼ 关闭
CLOSED
```

---

## 6. API 接口设计

### 6.1 告警规则

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/alarm-rules` | `alarm:create` | 创建告警规则 |
| POST | `/api/v1/alarm-rules/list` | `alarm:read` | 分页查询规则 |
| GET | `/api/v1/alarm-rules/{id}` | `alarm:read` | 查看规则详情 |
| PUT | `/api/v1/alarm-rules/{id}` | `alarm:update` | 更新规则 |
| DELETE | `/api/v1/alarm-rules/{id}` | `alarm:delete` | 删除规则 |

### 6.2 告警记录

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/alarm-records/list` | `alarm:read` | 分页查询告警记录 |
| GET | `/api/v1/alarm-records/{id}` | `alarm:read` | 查看告警详情 |
| PUT | `/api/v1/alarm-records/{id}/confirm` | `alarm:confirm` | 确认告警 |
| PUT | `/api/v1/alarm-records/{id}/process` | `alarm:process` | 处理告警 |
| PUT | `/api/v1/alarm-records/{id}/close` | `alarm:process` | 关闭告警 |

---

## 7. 后端实现

### 7.1 文件结构

```
firefly-system/src/main/java/.../system/
├── entity/
│   ├── AlarmRule.java
│   └── AlarmRecord.java
├── dto/alarm/
│   ├── AlarmRuleVO.java
│   ├── AlarmRuleCreateDTO.java
│   ├── AlarmRuleUpdateDTO.java
│   ├── AlarmRuleQueryDTO.java
│   ├── AlarmRecordVO.java
│   ├── AlarmRecordQueryDTO.java
│   └── AlarmProcessDTO.java
├── convert/
│   └── AlarmConvert.java
├── mapper/
│   ├── AlarmRuleMapper.java
│   └── AlarmRecordMapper.java
├── service/
│   └── AlarmService.java
└── controller/
    └── AlarmController.java
```

---

## 8. 前端交互设计

### 8.1 告警列表页

- **Tab 切换**: 告警规则 / 告警记录
- **告警记录搜索**: 级别筛选 + 状态筛选 + 时间范围
- **表格列**: 告警标题、级别（色彩标签）、状态、设备、触发时间、操作
- **操作**: 确认、处理（填备注）、关闭
- **路由**: `/alarm`

---

## 9. 非功能性需求

| 需求 | 指标 |
|------|------|
| **告警生成延迟** | P99 < 500ms（从条件匹配到记录写入） |
| **告警查询** | 分页查询 P99 < 200ms |
| **告警保留** | 默认保留 90 天，可按租户配置 |
