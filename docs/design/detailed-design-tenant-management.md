# Firefly-IoT 租户管理模块 — 详细设计文档

> **版本**: v1.0.0  
> **日期**: 2026-02-25  
> **状态**: Draft  
> **关联**: [产品设计文档](./product-design.md) §4 多租户体系设计、§5 跨租户设备数据共享、§15.1 租户管理

---

## 目录

1. [模块概述](#1-模块概述)
2. [核心概念与术语](#2-核心概念与术语)
3. [租户模型设计](#3-租户模型设计)
4. [数据库设计](#4-数据库设计)
5. [租户生命周期管理](#5-租户生命周期管理)
6. [多租户数据隔离](#6-多租户数据隔离)
7. [配额与计量系统](#7-配额与计量系统)
8. [租户资源初始化](#8-租户资源初始化)
9. [API 接口设计](#9-api-接口设计)
10. [缓存策略](#10-缓存策略)
11. [安全设计](#11-安全设计)
12. [前端交互设计](#12-前端交互设计)
13. [非功能性需求](#13-非功能性需求)

---

## 1. 模块概述

### 1.1 模块定位

租户管理模块是 Firefly-IoT 平台 **多租户架构的核心基座**，负责租户的全生命周期管理、资源隔离、配额计量，以及租户上下文在全链路中的传播。所有业务模块均依赖租户管理模块提供的租户上下文进行数据隔离和权限控制。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| **租户 CRUD** | 创建、查看、修改、注销租户 |
| **生命周期管理** | 创建 → 初始化 → 活跃 → 暂停 → 恢复 → 注销 全流程管理 |
| **数据隔离** | 支持共享库 RLS / Schema 隔离 / 独立库三种隔离模式 |
| **配额管理** | 设备数、消息速率、规则数、存储空间等多维度配额 |
| **计量统计** | 实时资源使用计量、用量趋势分析 |
| **版本/套餐** | 免费版 / 标准版 / 企业版 多版本配额策略 |
| **项目管理** | 租户内可选的逻辑分组 (Project) |
| **租户上下文传播** | 请求链路全程携带 tenantId，确保隔离 |

### 1.3 模块依赖关系

```
┌──────────────────────────────────────────────────────────────┐
│                      API Gateway                              │
│           (租户上下文提取 + 注入 X-Tenant-Id)                  │
└───────────────────────┬──────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────┐
│                    租户管理模块                                 │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ 租户管理  │  │ 项目管理  │  │ 配额管理  │  │ 计量统计     │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘  │
│  ┌──────────────────┐  ┌──────────────────┐                   │
│  │ 隔离策略管理      │  │ 资源初始化引擎    │                   │
│  └──────────────────┘  └──────────────────┘                   │
└───────────────────────┬──────────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ 用户权限  │  │ 设备管理  │  │ 消息总线  │
    │ 模块     │  │ 模块     │  │ (Kafka)  │
    └──────────┘  └──────────┘  └──────────┘
```

---

## 2. 核心概念与术语

| 术语 | 英文 | 说明 |
|------|------|------|
| **租户 (Tenant)** | Tenant | 平台的独立使用组织实体，拥有隔离的资源空间 |
| **项目 (Project)** | Project | 租户内的逻辑分组，用于组织产品、设备、规则等资源 |
| **套餐 (Plan)** | Plan | 租户订阅的服务版本 (FREE / STANDARD / ENTERPRISE) |
| **配额 (Quota)** | Quota | 租户可使用的资源上限 |
| **计量 (Metering)** | Metering | 租户实际使用资源的统计 |
| **隔离级别** | Isolation Level | 数据隔离策略 (SHARED_RLS / SCHEMA / DATABASE) |
| **租户上下文** | Tenant Context | 贯穿请求链路的租户身份信息 |
| **超级管理员** | Platform Admin | 管理所有租户的平台级管理员 |

---

## 3. 租户模型设计

### 3.1 租户层级结构

```
Platform (平台)
  │
  └── Tenant (租户/组织)
        │
        ├── Plan & Quota (套餐与配额)
        │
        ├── Project (项目, 可选逻辑分组)
        │     ├── Product (产品)
        │     │     └── Device (设备)
        │     ├── Rule (规则)
        │     └── Dashboard (仪表板)
        │
        ├── User & Role (用户与角色)
        │
        ├── Billing (计费)
        │
        └── Isolation Config (隔离配置)
              ├── Data Isolation (数据: RLS/Schema/Database)
              ├── Message Isolation (消息: Kafka Topic 前缀)
              ├── Access Isolation (接入: ClientID 命名空间)
              └── Network Isolation (网络: K8s Namespace)
```

### 3.2 租户状态机

```
                    ┌──────────────────┐
                    │   PENDING        │  (审批中, 仅SaaS模式)
                    │                  │
                    └────────┬─────────┘
                             │ 审批通过
                    ┌────────▼─────────┐
                    │   INITIALIZING   │  (资源初始化中)
                    │   - 创建 Schema  │
                    │   - 创建 Kafka   │
                    │     Topic        │
                    │   - 初始化管理员 │
                    └────────┬─────────┘
                             │ 初始化完成
                    ┌────────▼─────────┐
              ┌────►│    ACTIVE        │◄────┐
              │     │   (正常使用中)    │     │
              │     └────────┬─────────┘     │
              │              │               │
              │         ┌────┴────┐          │
              │         │         │          │
              │    超额/欠费   管理员操作    │
              │         │         │          │
              │    ┌────▼────┐  ┌─▼────────┐│
              │    │SUSPENDED│  │MAINTENANCE││
              │    │(已暂停) │  │(维护模式) ││
              │    │- 只读   │  │- 只读     ││
              │    │- 不可   │  │- 管理员可 ││
              │    │  新增   │  │  操作     ││
              │    └────┬────┘  └─┬────────┘│
              │         │         │          │
              │    充值/恢复   维护完成       │
              └─────────┘         └──────────┘
                             │
                       管理员注销
                             │
                    ┌────────▼─────────┐
                    │  DEACTIVATING    │  (注销中)
                    │  - 数据归档      │
                    │  - 资源回收      │
                    └────────┬─────────┘
                             │ 30 天保留期过后
                    ┌────────▼─────────┐
                    │   DELETED        │  (已删除/数据销毁)
                    └──────────────────┘
```

### 3.3 租户套餐定义

| 维度 | 免费版 (FREE) | 标准版 (STANDARD) | 企业版 (ENTERPRISE) |
|------|-------------|-------------------|---------------------|
| **设备数** | 100 | 10,000 | 不限 (自定义) |
| **消息速率** | 100 msg/s | 10,000 msg/s | 自定义 |
| **规则数** | 10 | 100 | 不限 |
| **数据保留** | 7 天 | 90 天 | 自定义 |
| **OTA 存储** | 1 GB | 50 GB | 不限 |
| **API 调用** | 10,000/天 | 1,000,000/天 | 不限 |
| **用户数** | 5 | 50 | 不限 |
| **项目数** | 1 | 10 | 不限 |
| **视频通道** | 5 | 100 | 不限 |
| **视频存储** | 10 GB | 500 GB | 不限 |
| **数据隔离** | 共享 RLS | 共享 RLS / Schema | Schema / 独立库 |
| **跨租户共享** | ❌ | ✅ (5 个策略) | ✅ (不限) |
| **SSO/LDAP** | ❌ | ❌ | ✅ |
| **SLA** | Best Effort | 99.9% | 99.99% |
| **技术支持** | 社区 | 工单 (8×5) | 专属 (24×7) |

---

## 4. 数据库设计

### 4.1 ER 图

```
┌──────────────────────┐
│      tenants          │
├──────────────────────┤
│ id (PK, BIGINT)      │
│ code (UK)             │──────┐
│ name                  │      │
│ display_name          │      │
│ description           │      │
│ logo_url              │      │
│ contact_name          │      │
│ contact_phone         │      │
│ contact_email         │      │
│ plan                  │      │    ┌──────────────────────┐
│ (FREE/STANDARD/       │      │    │    projects          │
│  ENTERPRISE)          │      │    ├──────────────────────┤
│ status                │      │    │ id (PK, BIGINT)      │
│ isolation_level       │      ├───►│ tenant_id (FK)       │
│ (SHARED_RLS/SCHEMA/   │      │    │ name                 │
│  DATABASE)            │      │    │ code                 │
│ isolation_config      │      │    │ description          │
│ (JSONB)               │      │    │ status               │
│ admin_user_id         │      │    │ created_by           │
│ expire_at             │      │    │ created_at           │
│ suspended_at          │      │    │ updated_at           │
│ suspended_reason      │      │    └──────────────────────┘
│ created_at            │      │
│ updated_at            │      │    ┌──────────────────────┐
│ deleted_at            │      │    │   tenant_quotas      │
└──────────────────────┘      │    ├──────────────────────┤
                               │    │ id (PK, BIGINT)      │
                               ├───►│ tenant_id (FK, UK)   │
                               │    │ max_devices          │
                               │    │ max_msg_per_sec      │
                               │    │ max_rules            │
                               │    │ data_retention_days  │
                               │    │ max_ota_storage_gb   │
                               │    │ max_api_calls_day    │
                               │    │ max_users            │
                               │    │ max_projects         │
                               │    │ max_video_channels   │
                               │    │ max_video_storage_gb │
                               │    │ max_share_policies   │
                               │    │ custom_config (JSONB)│
                               │    │ updated_at           │
                               │    └──────────────────────┘
                               │
                               │    ┌──────────────────────┐
                               │    │  tenant_usage_daily  │
                               │    ├──────────────────────┤
                               ├───►│ id (PK, BIGINT)      │
                               │    │ tenant_id (FK)       │
                               │    │ date                 │
                               │    │ device_count         │
                               │    │ device_online_peak   │
                               │    │ message_count        │
                               │    │ message_rate_peak    │
                               │    │ rule_count           │
                               │    │ api_call_count       │
                               │    │ storage_bytes        │
                               │    │ video_channel_count  │
                               │    │ video_storage_bytes  │
                               │    │ created_at           │
                               │    └──────────────────────┘
                               │
                               │    ┌──────────────────────┐
                               │    │tenant_usage_realtime │
                               │    ├──────────────────────┤
                               └───►│ tenant_id (PK)       │
                                    │ device_count         │
                                    │ device_online_count  │
                                    │ current_msg_rate     │
                                    │ rule_count           │
                                    │ api_calls_today      │
                                    │ ota_storage_bytes    │
                                    │ video_channel_active │
                                    │ video_storage_bytes  │
                                    │ user_count           │
                                    │ project_count        │
                                    │ share_policy_count   │
                                    │ updated_at           │
                                    └──────────────────────┘

┌──────────────────────┐
│ tenant_audit_logs    │
├──────────────────────┤
│ id (PK, BIGINT)      │
│ tenant_id            │
│ operator_id          │
│ action               │
│ (CREATE/UPDATE/      │
│  SUSPEND/RESUME/     │
│  DEACTIVATE/         │
│  UPGRADE_PLAN/       │
│  QUOTA_CHANGE)       │
│ detail (JSONB)       │
│ ip_address           │
│ created_at           │
└──────────────────────┘
```

### 4.2 DDL 语句

```sql
-- ============================================================
-- 租户表
-- ============================================================
CREATE TABLE tenants (
    id                  BIGSERIAL PRIMARY KEY,
    code                VARCHAR(64) NOT NULL UNIQUE,          -- 租户唯一代码 (URL友好)
    name                VARCHAR(256) NOT NULL,                -- 租户名称
    display_name        VARCHAR(256),                          -- 显示名称
    description         TEXT,
    logo_url            VARCHAR(512),
    contact_name        VARCHAR(128),
    contact_phone       VARCHAR(32),
    contact_email       VARCHAR(256),
    plan                VARCHAR(32) NOT NULL DEFAULT 'FREE',  -- FREE / STANDARD / ENTERPRISE
    status              VARCHAR(32) NOT NULL DEFAULT 'INITIALIZING',
    isolation_level     VARCHAR(32) NOT NULL DEFAULT 'SHARED_RLS',
    isolation_config    JSONB DEFAULT '{}',
    -- isolation_config 示例:
    -- SHARED_RLS:  {}
    -- SCHEMA:      {"schemaName": "tenant_001"}
    -- DATABASE:    {"dbHost": "pg-t001.internal", "dbPort": 5432, "dbName": "firefly_t001"}
    admin_user_id       BIGINT,
    expire_at           TIMESTAMPTZ,
    suspended_at        TIMESTAMPTZ,
    suspended_reason    VARCHAR(512),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_plan ON tenants(plan);

-- ============================================================
-- 项目表
-- ============================================================
CREATE TABLE projects (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
    code            VARCHAR(64) NOT NULL,
    name            VARCHAR(256) NOT NULL,
    description     TEXT,
    status          VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE / ARCHIVED
    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uk_project_tenant_code UNIQUE (tenant_id, code)
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_tenant_isolation ON projects
    USING (tenant_id = current_setting('app.tenant_id')::BIGINT);

-- ============================================================
-- 租户配额表
-- ============================================================
CREATE TABLE tenant_quotas (
    id                      BIGSERIAL PRIMARY KEY,
    tenant_id               BIGINT NOT NULL UNIQUE REFERENCES tenants(id),
    max_devices             INT NOT NULL DEFAULT 100,
    max_msg_per_sec         INT NOT NULL DEFAULT 100,
    max_rules               INT NOT NULL DEFAULT 10,
    data_retention_days     INT NOT NULL DEFAULT 7,
    max_ota_storage_gb      INT NOT NULL DEFAULT 1,
    max_api_calls_day       INT NOT NULL DEFAULT 10000,
    max_users               INT NOT NULL DEFAULT 5,
    max_projects            INT NOT NULL DEFAULT 1,
    max_video_channels      INT NOT NULL DEFAULT 5,
    max_video_storage_gb    INT NOT NULL DEFAULT 10,
    max_share_policies      INT NOT NULL DEFAULT 0,
    custom_config           JSONB DEFAULT '{}',           -- 企业版自定义配额
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 租户实时用量表 (Redis 主存储, PG 持久化备份)
-- ============================================================
CREATE TABLE tenant_usage_realtime (
    tenant_id               BIGINT PRIMARY KEY REFERENCES tenants(id),
    device_count            INT NOT NULL DEFAULT 0,
    device_online_count     INT NOT NULL DEFAULT 0,
    current_msg_rate        DOUBLE PRECISION NOT NULL DEFAULT 0,
    rule_count              INT NOT NULL DEFAULT 0,
    api_calls_today         BIGINT NOT NULL DEFAULT 0,
    ota_storage_bytes       BIGINT NOT NULL DEFAULT 0,
    video_channel_active    INT NOT NULL DEFAULT 0,
    video_storage_bytes     BIGINT NOT NULL DEFAULT 0,
    user_count              INT NOT NULL DEFAULT 0,
    project_count           INT NOT NULL DEFAULT 0,
    share_policy_count      INT NOT NULL DEFAULT 0,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 租户每日用量统计表 (时序数据)
-- ============================================================
CREATE TABLE tenant_usage_daily (
    id                      BIGSERIAL PRIMARY KEY,
    tenant_id               BIGINT NOT NULL REFERENCES tenants(id),
    date                    DATE NOT NULL,
    device_count            INT NOT NULL DEFAULT 0,
    device_online_peak      INT NOT NULL DEFAULT 0,
    message_count           BIGINT NOT NULL DEFAULT 0,
    message_rate_peak       INT NOT NULL DEFAULT 0,
    rule_count              INT NOT NULL DEFAULT 0,
    api_call_count          BIGINT NOT NULL DEFAULT 0,
    storage_bytes           BIGINT NOT NULL DEFAULT 0,
    video_channel_count     INT NOT NULL DEFAULT 0,
    video_storage_bytes     BIGINT NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uk_tenant_usage_daily UNIQUE (tenant_id, date)
);

CREATE INDEX idx_usage_daily_tenant_date ON tenant_usage_daily(tenant_id, date DESC);

-- ============================================================
-- 租户审计日志
-- ============================================================
CREATE TABLE tenant_audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    operator_id     BIGINT NOT NULL,
    action          VARCHAR(32) NOT NULL,
    detail          JSONB,
    ip_address      VARCHAR(45),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenant_audit_tenant ON tenant_audit_logs(tenant_id, created_at DESC);
```

### 4.3 套餐配额模板 (Seed Data)

```sql
-- 套餐模板配置 (存储为系统配置，创建租户时根据套餐模板初始化 tenant_quotas)
INSERT INTO system_configs (key, value) VALUES
('plan.FREE', '{
  "maxDevices": 100, "maxMsgPerSec": 100, "maxRules": 10,
  "dataRetentionDays": 7, "maxOtaStorageGb": 1, "maxApiCallsDay": 10000,
  "maxUsers": 5, "maxProjects": 1, "maxVideoChannels": 5,
  "maxVideoStorageGb": 10, "maxSharePolicies": 0
}'),
('plan.STANDARD', '{
  "maxDevices": 10000, "maxMsgPerSec": 10000, "maxRules": 100,
  "dataRetentionDays": 90, "maxOtaStorageGb": 50, "maxApiCallsDay": 1000000,
  "maxUsers": 50, "maxProjects": 10, "maxVideoChannels": 100,
  "maxVideoStorageGb": 500, "maxSharePolicies": 5
}'),
('plan.ENTERPRISE', '{
  "maxDevices": -1, "maxMsgPerSec": -1, "maxRules": -1,
  "dataRetentionDays": -1, "maxOtaStorageGb": -1, "maxApiCallsDay": -1,
  "maxUsers": -1, "maxProjects": -1, "maxVideoChannels": -1,
  "maxVideoStorageGb": -1, "maxSharePolicies": -1
}');
-- 注: -1 表示不限
```

---

## 5. 租户生命周期管理

### 5.1 租户创建流程

```
平台管理员 / 自助注册
        │
        ▼
  POST /api/v1/tenants
  {
    "code": "acme_corp",
    "name": "ACME 物联科技有限公司",
    "plan": "STANDARD",
    "contactName": "李经理",
    "contactPhone": "13800138000",
    "contactEmail": "li@acme.com",
    "isolationLevel": "SHARED_RLS",
    "adminUser": {
      "username": "admin",
      "phone": "13800138000",
      "email": "li@acme.com",
      "password": "初始密码"
    }
  }
        │
        ▼
  ┌─────────────────────────┐
  │ 1. 参数校验              │
  │    - 租户 code 唯一      │
  │    - 套餐有效            │
  │    - 隔离级别合法        │
  └───────────┬─────────────┘
              │
              ▼
  ┌─────────────────────────┐
  │ 2. 创建租户记录          │
  │    status = INITIALIZING │
  └───────────┬─────────────┘
              │
              ▼
  ┌─────────────────────────┐
  │ 3. 异步资源初始化        │
  │    (发送 Kafka 事件)     │
  │    tenant.initializing   │
  └───────────┬─────────────┘
              │
              ▼
  ┌─────────────────────────┐
  │ 4. 资源初始化引擎执行    │
  │    (详见 §8)             │
  │    - 数据隔离资源       │
  │    - Kafka Topic         │
  │    - 默认项目            │
  │    - 管理员用户 & 角色   │
  │    - 配额记录            │
  │    - 实时用量记录        │
  └───────────┬─────────────┘
              │
              ▼
  ┌─────────────────────────┐
  │ 5. 初始化完成            │
  │    status → ACTIVE       │
  │    发送 tenant.activated │
  │    发送欢迎邮件          │
  └─────────────────────────┘
```

### 5.2 租户暂停流程

```
触发条件:
  - 超额使用且未升级 (自动)
  - 欠费 (自动)
  - 管理员手动暂停

流程:
  1. 更新 status → SUSPENDED, 记录 suspended_at, suspended_reason
  2. 发送 tenant.suspended 事件
  3. 影响:
     - 设备仍可保持连接 (不主动断开)
     - 禁止新设备接入
     - 禁止创建新资源 (设备/产品/规则)
     - 已有数据只读
     - 管理控制台显示暂停提示
  4. 发送通知给租户管理员 (邮件 + 短信)
```

### 5.3 租户恢复流程

```
触发条件:
  - 配额恢复 (充值/升级套餐)
  - 管理员手动恢复

流程:
  1. 校验恢复条件 (配额充足/付费到账)
  2. 更新 status → ACTIVE, 清除 suspended_at
  3. 发送 tenant.resumed 事件
  4. 所有功能恢复正常
```

### 5.4 租户注销流程

```
租户管理员申请注销 / 平台管理员强制注销
        │
        ▼
  ┌─────────────────────────┐
  │ 1. 二次确认              │
  │    - 输入密码确认        │
  │    - 确认了解数据将被    │
  │      归档/销毁           │
  └───────────┬─────────────┘
              │
              ▼
  ┌─────────────────────────┐
  │ 2. 进入注销期            │
  │    status → DEACTIVATING │
  │    保留期: 30 天          │
  └───────────┬─────────────┘
              │
              ▼
  ┌─────────────────────────┐
  │ 3. 注销期间              │
  │    - 断开所有设备连接    │
  │    - 停止规则引擎        │
  │    - 控制台只读          │
  │    - 支持数据导出        │
  │    - 可随时取消注销      │
  └───────────┬─────────────┘
              │ 30 天后
              ▼
  ┌─────────────────────────┐
  │ 4. 数据清理              │
  │    - 归档必要数据到 S3   │
  │    - 删除 Kafka Topic    │
  │    - 删除 Schema/DB     │
  │    - 删除 Redis 缓存     │
  │    - 删除 MinIO 文件     │
  │    - 逻辑删除租户记录    │
  └───────────┬─────────────┘
              │
              ▼
  status → DELETED
  发送 tenant.deleted 事件
```

---

## 6. 多租户数据隔离

### 6.1 隔离级别概览

```
┌────────────────────────────────────────────────────────────────┐
│                    隔离级别选择决策树                              │
│                                                                │
│  租户规模?                                                      │
│  │                                                              │
│  ├── 小型 (≤1000设备, 免费版/标准版)                              │
│  │   └── SHARED_RLS (共享库 + RLS)                              │
│  │       成本最低，资源利用率最高                                  │
│  │                                                              │
│  ├── 中型 (≤50000设备, 标准版)                                   │
│  │   └── SCHEMA (独立 Schema)                                   │
│  │       较好的隔离性，适度的管理成本                              │
│  │                                                              │
│  └── 大型 (>50000设备, 企业版)                                   │
│      └── DATABASE (独立数据库实例)                                │
│          最强隔离，独立性能，成本最高                              │
└────────────────────────────────────────────────────────────────┘
```

### 6.2 SHARED_RLS 隔离实现

```sql
-- 1. 所有业务表包含 tenant_id 列
ALTER TABLE devices ADD COLUMN tenant_id BIGINT NOT NULL;

-- 2. 启用 RLS
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- 3. 创建隔离策略
CREATE POLICY devices_tenant_isolation ON devices
    USING (tenant_id = current_setting('app.tenant_id')::BIGINT);

-- 4. 确保应用角色受 RLS 约束 (非 superuser)
CREATE ROLE app_user LOGIN;
GRANT SELECT, INSERT, UPDATE, DELETE ON devices TO app_user;

-- 5. 应用层在每次连接/请求时设置租户上下文
SET app.tenant_id = '12345';
```

### 6.3 SCHEMA 隔离实现

```sql
-- 创建租户独立 Schema
CREATE SCHEMA tenant_acme_corp;

-- 在 Schema 中创建业务表 (无需 tenant_id 列)
CREATE TABLE tenant_acme_corp.devices (
    id BIGSERIAL PRIMARY KEY,
    -- ... (无 tenant_id)
);

-- 应用层动态切换 search_path
SET search_path TO tenant_acme_corp, public;
```

### 6.4 DATABASE 隔离实现

```java
// 动态数据源路由
@Component
public class TenantDataSourceRouter extends AbstractRoutingDataSource {

    @Override
    protected Object determineCurrentLookupKey() {
        TenantContext ctx = TenantContextHolder.get();
        if (ctx.getIsolationLevel() == IsolationLevel.DATABASE) {
            return "tenant_" + ctx.getTenantId();
        }
        return "default";
    }
}
```

### 6.5 租户上下文传播

```
请求链路: Gateway → 微服务 → 数据库

1. Gateway 层:
   - 从 JWT 或 Header 提取 tenantId
   - 设置 X-Tenant-Id Header
   - 写入请求上下文

2. 微服务层:
   - Filter/Interceptor 从 Header 读取 tenantId
   - 写入 TenantContextHolder (ThreadLocal)
   - 虚拟线程环境使用 ScopedValue

3. 数据库层:
   - 连接获取后执行 SET app.tenant_id = ?
   - MyBatis/JPA 拦截器自动注入 tenant_id 条件

4. 消息层:
   - Kafka Producer 设置 Header: tenantId
   - Consumer 解析 Header 恢复租户上下文

5. 异步任务:
   - 提交异步任务前捕获 TenantContext
   - 任务执行时恢复上下文
```

```java
// 租户上下文持有者
public class TenantContextHolder {
    private static final ThreadLocal<TenantContext> CONTEXT = new ThreadLocal<>();

    public static void set(TenantContext ctx) { CONTEXT.set(ctx); }
    public static TenantContext get() { return CONTEXT.get(); }
    public static void clear() { CONTEXT.remove(); }
}

// 租户上下文
@Data
public class TenantContext {
    private Long tenantId;
    private String tenantCode;
    private String plan;
    private IsolationLevel isolationLevel;
    private Map<String, Object> isolationConfig;
}

// Gateway Filter
@Component
public class TenantContextFilter implements GlobalFilter {
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String tenantId = extractTenantId(exchange);
        exchange.getRequest().mutate()
            .header("X-Tenant-Id", tenantId)
            .build();
        return chain.filter(exchange);
    }
}

// 微服务 Interceptor
@Component
public class TenantInterceptor implements HandlerInterceptor {
    @Autowired
    private TenantService tenantService;

    @Override
    public boolean preHandle(HttpServletRequest req, ...) {
        String tenantId = req.getHeader("X-Tenant-Id");
        TenantContext ctx = tenantService.getTenantContext(Long.parseLong(tenantId));
        TenantContextHolder.set(ctx);
        return true;
    }

    @Override
    public void afterCompletion(...) {
        TenantContextHolder.clear();
    }
}
```

### 6.6 消息隔离

```
Kafka Topic 命名规范:
  t_{tenantCode}_{topicType}

示例:
  t_acme_corp_device_raw       -- 设备原始消息
  t_acme_corp_device_event     -- 设备事件
  t_acme_corp_rule_output      -- 规则引擎输出
  t_acme_corp_alarm            -- 告警消息

ACL 规则:
  - 每个租户的服务实例只能读写本租户 Topic
  - 通过 Kafka ACL 或 SASL 认证实现
```

---

## 7. 配额与计量系统

### 7.1 配额检查流程

```
业务操作请求 (如创建设备)
        │
        ▼
  ┌─────────────────────────┐
  │ 配额检查拦截器            │
  │ @CheckQuota("device")   │
  └───────────┬─────────────┘
              │
              ▼
  ┌─────────────────────────┐
  │ 获取租户配额              │       ┌──────────────┐
  │ (Redis 缓存优先)         │◄──────│ tenant_quotas│
  │                          │       └──────────────┘
  │ 获取当前用量              │       ┌──────────────┐
  │ (Redis 计数器)           │◄──────│ Redis Counter│
  └───────────┬─────────────┘       └──────────────┘
              │
         ┌────┴────┐
         │ 超额?   │
         ├─ NO ───► 执行业务逻辑 → 更新用量计数器
         └─ YES ──► 返回 429 Too Many Resources
                    {
                      "code": "QUOTA_EXCEEDED",
                      "message": "设备数已达上限(100/100)",
                      "quota": 100,
                      "current": 100,
                      "upgrade_url": "/pricing"
                    }
```

### 7.2 实时用量计数 (Redis)

```
Redis Key 设计:

# 设备计数
quota:tenant:{tenantId}:device_count          -- INT, 设备总数
quota:tenant:{tenantId}:device_online         -- INT, 在线设备数

# 消息速率 (滑动窗口)
quota:tenant:{tenantId}:msg_rate:{timestamp}  -- INT, 每秒消息数
                                               -- TTL: 60s

# 每日 API 调用计数
quota:tenant:{tenantId}:api_calls:{date}      -- INT, 当日调用次数
                                               -- TTL: 48h

# 规则计数
quota:tenant:{tenantId}:rule_count            -- INT

# 用户计数
quota:tenant:{tenantId}:user_count            -- INT
```

### 7.3 计量数据持久化

```
定时任务 (每 5 分钟):
  1. 从 Redis 读取所有租户的实时用量
  2. 更新 tenant_usage_realtime 表 (PG)
  3. 检测是否有租户接近配额上限 (≥90%)
  4. 触发预警通知

定时任务 (每日 00:05):
  1. 汇总前一天的用量数据
  2. 写入 tenant_usage_daily 表
  3. 重置每日计数器 (api_calls)
  4. 生成日报 (可选)
```

### 7.4 配额预警

| 触发条件 | 动作 |
|---------|------|
| 用量 ≥ 80% | 发送预警通知 (邮件) |
| 用量 ≥ 90% | 发送紧急通知 (邮件 + 短信) |
| 用量 ≥ 100% | 暂停新增操作，发送超额通知 |
| 用量 ≥ 120% (宽限) | 暂停租户 (SUSPENDED) |

---

## 8. 租户资源初始化

### 8.1 初始化流程编排

```
tenant.initializing 事件
        │
        ▼
  ┌─────────────────────────────────────────┐
  │         资源初始化引擎 (Saga 模式)         │
  │                                          │
  │  Step 1: 数据隔离资源                     │
  │    SHARED_RLS → 无需操作                  │
  │    SCHEMA     → CREATE SCHEMA             │
  │    DATABASE   → 创建独立 PG 实例/DB       │
  │                                          │
  │  Step 2: 初始化数据库表 (SCHEMA/DB 模式)   │
  │    执行 DDL 脚本创建业务表                 │
  │                                          │
  │  Step 3: 创建 Kafka Topics               │
  │    t_{code}_device_raw                    │
  │    t_{code}_device_event                  │
  │    t_{code}_rule_output                   │
  │    t_{code}_alarm                         │
  │                                          │
  │  Step 4: 初始化配额记录                    │
  │    根据套餐模板创建 tenant_quotas 记录      │
  │                                          │
  │  Step 5: 初始化实时用量记录                │
  │    创建 tenant_usage_realtime (全零)       │
  │    创建 Redis 计数器 (全零)                │
  │                                          │
  │  Step 6: 创建默认项目                      │
  │    name: "默认项目"                        │
  │                                          │
  │  Step 7: 创建管理员用户                    │
  │    分配 TENANT_ADMIN 角色                  │
  │                                          │
  │  Step 8: 创建预置角色                      │
  │    TENANT_ADMIN / PROJECT_ADMIN /         │
  │    DEVELOPER / OPERATOR / VIEWER          │
  │                                          │
  │  ✅ 全部成功 → status = ACTIVE             │
  │  ❌ 任一失败 → 回滚已创建资源, 报告错误     │
  └─────────────────────────────────────────┘
```

### 8.2 补偿回滚

每个初始化步骤注册对应的补偿操作：

| 步骤 | 正向操作 | 补偿操作 |
|------|---------|---------|
| Step 1 | CREATE SCHEMA | DROP SCHEMA CASCADE |
| Step 3 | CREATE TOPIC | DELETE TOPIC |
| Step 4 | INSERT tenant_quotas | DELETE FROM tenant_quotas |
| Step 5 | INSERT tenant_usage_realtime + Redis | DELETE + DEL keys |
| Step 6 | INSERT project | DELETE FROM projects |
| Step 7 | INSERT user | DELETE FROM users |
| Step 8 | INSERT roles | DELETE FROM roles |

---

## 9. API 接口设计

### 9.1 租户管理 API (平台管理员)

| 接口 | 方法 | 说明 | 所需权限 |
|------|------|------|---------|
| `/api/v1/platform/tenants` | GET | 租户列表 (分页/筛选) | `PLATFORM_ADMIN` |
| `/api/v1/platform/tenants` | POST | 创建租户 | `PLATFORM_ADMIN` |
| `/api/v1/platform/tenants/{id}` | GET | 租户详情 | `PLATFORM_ADMIN` |
| `/api/v1/platform/tenants/{id}` | PUT | 修改租户信息 | `PLATFORM_ADMIN` |
| `/api/v1/platform/tenants/{id}/status` | PUT | 变更租户状态 | `PLATFORM_ADMIN` |
| `/api/v1/platform/tenants/{id}/plan` | PUT | 升级/降级套餐 | `PLATFORM_ADMIN` |
| `/api/v1/platform/tenants/{id}/quota` | GET | 查看配额 | `PLATFORM_ADMIN` |
| `/api/v1/platform/tenants/{id}/quota` | PUT | 修改配额 | `PLATFORM_ADMIN` |
| `/api/v1/platform/tenants/{id}/usage` | GET | 查看用量统计 | `PLATFORM_ADMIN` |
| `/api/v1/platform/tenants/{id}/usage/daily` | GET | 每日用量趋势 | `PLATFORM_ADMIN` |
| `/api/v1/platform/tenants/{id}/deactivate` | POST | 注销租户 | `PLATFORM_ADMIN` |
| `/api/v1/platform/tenants/overview` | GET | 全平台租户概览统计 | `PLATFORM_ADMIN` |

### 9.2 租户自管理 API (租户管理员)

| 接口 | 方法 | 说明 | 所需权限 |
|------|------|------|---------|
| `/api/v1/tenant` | GET | 当前租户信息 | `tenant:read` |
| `/api/v1/tenant` | PUT | 修改租户信息 | `tenant:manage` |
| `/api/v1/tenant/quota` | GET | 查看配额与用量 | `tenant:read` |
| `/api/v1/tenant/usage` | GET | 用量统计 | `tenant:read` |
| `/api/v1/tenant/usage/daily` | GET | 每日用量趋势 | `tenant:read` |

### 9.3 项目管理 API

| 接口 | 方法 | 说明 | 所需权限 |
|------|------|------|---------|
| `/api/v1/projects` | GET | 项目列表 | 登录即可 |
| `/api/v1/projects` | POST | 创建项目 | `tenant:manage` |
| `/api/v1/projects/{id}` | GET | 项目详情 | 登录即可 |
| `/api/v1/projects/{id}` | PUT | 修改项目 | `tenant:manage` |
| `/api/v1/projects/{id}` | DELETE | 删除/归档项目 | `tenant:manage` |

### 9.4 请求/响应示例

#### 创建租户

```http
POST /api/v1/platform/tenants
Content-Type: application/json
Authorization: Bearer {platform_admin_token}

{
  "code": "acme_corp",
  "name": "ACME 物联科技有限公司",
  "displayName": "ACME IoT",
  "plan": "STANDARD",
  "isolationLevel": "SHARED_RLS",
  "contactName": "李经理",
  "contactPhone": "13800138000",
  "contactEmail": "li@acme.com",
  "adminUser": {
    "username": "admin",
    "phone": "13800138000",
    "email": "li@acme.com"
  }
}
```

**响应 (201 Created):**

```json
{
  "code": 0,
  "data": {
    "id": 1001,
    "code": "acme_corp",
    "name": "ACME 物联科技有限公司",
    "displayName": "ACME IoT",
    "plan": "STANDARD",
    "status": "INITIALIZING",
    "isolationLevel": "SHARED_RLS",
    "contactName": "李经理",
    "contactEmail": "li@acme.com",
    "adminUser": {
      "username": "admin",
      "temporaryPassword": "Abc@2026Random"
    },
    "createdAt": "2026-02-25T10:00:00Z"
  }
}
```

#### 查看配额与用量

```http
GET /api/v1/tenant/quota
Authorization: Bearer {tenant_admin_token}
```

**响应:**

```json
{
  "code": 0,
  "data": {
    "plan": "STANDARD",
    "quotas": {
      "maxDevices": 10000,
      "maxMsgPerSec": 10000,
      "maxRules": 100,
      "dataRetentionDays": 90,
      "maxOtaStorageGb": 50,
      "maxApiCallsDay": 1000000,
      "maxUsers": 50,
      "maxProjects": 10,
      "maxVideoChannels": 100,
      "maxVideoStorageGb": 500
    },
    "usage": {
      "deviceCount": 3256,
      "deviceOnlineCount": 2890,
      "currentMsgRate": 1200,
      "ruleCount": 23,
      "apiCallsToday": 45678,
      "otaStorageGb": 12.5,
      "userCount": 18,
      "projectCount": 3,
      "videoChannelActive": 45,
      "videoStorageGb": 120.8
    },
    "percentages": {
      "devices": 32.56,
      "msgRate": 12.00,
      "rules": 23.00,
      "apiCalls": 4.57,
      "otaStorage": 25.00,
      "users": 36.00,
      "projects": 30.00,
      "videoChannels": 45.00,
      "videoStorage": 24.16
    }
  }
}
```

#### 变更租户状态

```http
PUT /api/v1/platform/tenants/1001/status
Content-Type: application/json

{
  "status": "SUSPENDED",
  "reason": "超额使用未升级套餐"
}
```

---

## 10. 缓存策略

### 10.1 缓存结构

| 缓存 Key | 内容 | TTL | 失效策略 |
|---------|------|-----|---------|
| `tenant:info:{tenantId}` | 租户基本信息 + 隔离配置 | 1 h | 租户信息变更时删除 |
| `tenant:ctx:{tenantId}` | 租户上下文 (TenantContext) | 30 min | 同上 |
| `tenant:quota:{tenantId}` | 租户配额配置 | 1 h | 配额变更时删除 |
| `quota:tenant:{tenantId}:*` | 实时用量计数器 | 不过期 (手动管理) | 租户注销时清除 |

### 10.2 租户上下文高频缓存

由于每个请求都需要加载租户上下文，采用二级缓存：

```
L1: Caffeine 本地缓存 (每个微服务实例)
    Key: tenantId → TenantContext
    TTL: 5 min
    Max: 1000 个租户

L2: Redis 缓存
    Key: tenant:ctx:{tenantId}
    TTL: 30 min

失效: 租户信息变更时通过 Kafka 事件广播，各实例清除 L1
```

---

## 11. 安全设计

### 11.1 租户隔离安全

| 防护 | 说明 |
|------|------|
| **RLS 强制** | PostgreSQL RLS 在数据库层面强制隔离，即使应用层逻辑错误也无法越权 |
| **上下文强制** | 所有 API 请求必须携带有效 tenantId，缺失则拒绝 |
| **跨租户校验** | 涉及 tenantId 的操作，后端二次校验用户所属租户 |
| **Schema/DB 隔离** | 中大型租户独立 Schema/DB，物理层面杜绝数据串联 |

### 11.2 租户操作安全

| 操作 | 安全措施 |
|------|---------|
| 创建租户 | 仅 PLATFORM_ADMIN |
| 注销租户 | 二次密码确认 + 30 天保留期 |
| 修改配额 | 仅 PLATFORM_ADMIN，记录审计日志 |
| 暂停/恢复 | 记录原因 + 通知租户管理员 |
| 套餐变更 | 降级检查资源使用是否超出新套餐限制 |

### 11.3 数据安全

| 措施 | 说明 |
|------|------|
| **租户注销数据清理** | 归档 → 保留 30 天 → 彻底删除 |
| **敏感数据加密** | 租户联系方式、密码等加密存储 |
| **备份隔离** | 独立库租户的备份独立管理 |
| **审计追溯** | 所有租户管理操作记录审计日志 |

---

## 12. 前端交互设计

### 12.1 平台管理端 — 租户总览

```
┌──────────────────────────────────────────────────────────────┐
│ 租户管理                                     [+ 创建租户]     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  📊 总览                                                     │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐             │
│  │  128   │  │  115   │  │   8    │  │   5    │             │
│  │ 总租户  │  │ 活跃   │  │ 暂停   │  │ 注销中  │             │
│  └────────┘  └────────┘  └────────┘  └────────┘             │
│                                                              │
│  搜索: [租户名/代码________] 套餐: [全部 ▼] 状态: [全部 ▼]   │
├──────────────────────────────────────────────────────────────┤
│  租户代码     │ 名称           │ 套餐   │ 设备数   │ 状态   │ │
│──────────────┼───────────────┼────────┼─────────┼────────│ │
│  acme_corp   │ ACME物联科技   │ 标准版 │ 3256    │ ✅活跃  │ │
│  beta_iot    │ Beta智能科技   │ 企业版 │ 89,234  │ ✅活跃  │ │
│  test_demo   │ 测试租户       │ 免费版 │ 45      │ 🚫暂停  │ │
├──────────────────────────────────────────────────────────────┤
│                    共 128 条  < 1 2 3 ... >                   │
└──────────────────────────────────────────────────────────────┘
```

### 12.2 租户详情页

```
┌──────────────────────────────────────────────────────────────┐
│ ← 返回  acme_corp - ACME 物联科技有限公司     [编辑] [暂停]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [基本信息] [配额用量] [用量趋势] [项目列表] [审计日志]       │
│                                                              │
│  ── 配额用量 ──────────────────────────────────────────────  │
│                                                              │
│  设备数       ████████░░░░░░░░░░░░░░  3,256 / 10,000 (33%)  │
│  消息速率     ██░░░░░░░░░░░░░░░░░░░░  1,200 / 10,000 (12%)  │
│  规则数       █████░░░░░░░░░░░░░░░░░  23 / 100 (23%)        │
│  OTA 存储     █████████░░░░░░░░░░░░░  12.5 / 50 GB (25%)    │
│  API 调用     █░░░░░░░░░░░░░░░░░░░░░  45,678 / 1M (5%)      │
│  用户数       ████████░░░░░░░░░░░░░░  18 / 50 (36%)         │
│  视频通道     ██████████░░░░░░░░░░░░  45 / 100 (45%)        │
│  视频存储     █████░░░░░░░░░░░░░░░░░  120 / 500 GB (24%)    │
│                                                              │
│                               [升级套餐]  [调整配额]          │
└──────────────────────────────────────────────────────────────┘
```

### 12.3 租户自管理 — 概览页

```
┌──────────────────────────────────────────────────────────────┐
│ 租户设置                                                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  组织信息                                [编辑]              │
│  ┌──────────────────────────────────────────────┐            │
│  │ 组织名称:    ACME 物联科技有限公司             │            │
│  │ 租户代码:    acme_corp                        │            │
│  │ 当前套餐:    标准版                   [升级]   │            │
│  │ 联系人:      李经理                            │            │
│  │ 联系邮箱:    li@acme.com                       │            │
│  │ 创建时间:    2026-01-15                        │            │
│  │ 到期时间:    2027-01-15                        │            │
│  └──────────────────────────────────────────────┘            │
│                                                              │
│  资源使用 (实时)                                              │
│  ┌──────────────────────────────────────────────┐            │
│  │ 📱 设备:  3,256/10,000   📡 在线: 2,890       │            │
│  │ 📨 消息:  1,200 msg/s    📜 规则: 23/100      │            │
│  │ 👤 用户:  18/50          📁 项目: 3/10        │            │
│  └──────────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────┘
```

---

## 13. 非功能性需求

### 13.1 性能要求

| 指标 | 要求 |
|------|------|
| 租户上下文加载 | ≤ 2 ms (L1 缓存命中) |
| 配额检查 | ≤ 3 ms (Redis 读取) |
| 租户创建 (含初始化) | ≤ 30 s |
| 租户列表查询 | ≤ 200 ms (P99) |
| 实时用量更新 | ≤ 1 ms (Redis INCR) |

### 13.2 可扩展性

- 隔离级别可在线迁移 (SHARED_RLS → SCHEMA → DATABASE)
- 配额项可动态扩展 (custom_config JSONB 字段)
- 初始化步骤支持插件扩展 (新业务模块可注册初始化钩子)

### 13.3 高可用

- 租户上下文缓存多级冗余 (L1 + L2 + DB)
- 初始化失败支持自动重试 (3 次) + 手动重试
- Saga 模式确保初始化原子性 (成功或完全回滚)

### 13.4 监控指标

| 指标 | 说明 |
|------|------|
| `tenant_count{plan,status}` | 各套餐/状态租户数 |
| `tenant_init_duration_seconds` | 租户初始化耗时 |
| `tenant_init_failure_total` | 初始化失败次数 |
| `tenant_quota_usage_ratio{tenant,resource}` | 配额使用率 |
| `tenant_context_cache_hit_ratio` | 上下文缓存命中率 |

---

> **文档维护**: 本文档随项目迭代持续更新，最新版本请以仓库 `docs/design/detailed-design-tenant-management.md` 为准。
