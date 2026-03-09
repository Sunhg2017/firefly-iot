# Firefly-IoT 用户权限模块 — 详细设计文档

> **版本**: v1.0.0  
> **日期**: 2026-02-25  
> **状态**: Draft  
> **关联**: [产品设计文档](./product-design.md) §12.2 RBAC 权限模型、§15.1 用户权限

---

## 目录

1. [模块概述](#1-模块概述)
2. [核心概念与术语](#2-核心概念与术语)
3. [权限模型设计](#3-权限模型设计)
   - [3.2.1 角色与前端空间映射](#321-角色与前端空间映射)
4. [数据库设计](#4-数据库设计)
5. [核心流程设计](#5-核心流程设计)
6. [API 接口设计](#6-api-接口设计)
7. [缓存策略](#7-缓存策略)
8. [安全设计](#8-安全设计)
9. [前端交互设计](#9-前端交互设计)
10. [非功能性需求](#10-非功能性需求)

---

## 1. 模块概述

### 1.1 模块定位

用户权限模块是 Firefly-IoT 平台的核心安全基座，负责 **用户身份管理** 和 **访问控制**，贯穿所有业务模块。模块基于 **RBAC (Role-Based Access Control)** 模型，并结合 **ABAC (Attribute-Based Access Control)** 实现细粒度的资源级权限控制。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| **用户管理** | 用户 CRUD、状态管理、密码策略、个人信息维护 |
| **角色管理** | 预置角色 + 自定义角色、角色继承、角色与权限绑定 |
| **权限管理** | 资源级权限定义、权限组、动态权限校验 |
| **API Key 管理** | 服务间调用凭证管理、权限范围限定、有效期管理 |
| **数据权限** | 基于租户/项目/分组的数据范围控制 |
| **审计集成** | 权限变更日志、用户操作审计 |

### 1.3 模块依赖关系

```
┌──────────────────────────────────────────────────────────────┐
│                      API Gateway                              │
│              (Token 校验 + 权限预检)                           │
└───────────────────────┬──────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────┐
│                   用户权限模块                                  │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ 用户管理  │  │ 角色管理  │  │ 权限引擎  │  │ API Key 管理 │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘  │
└───────────────────────┬──────────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ 租户服务  │  │ 认证中心  │  │ 审计日志  │
    └──────────┘  └──────────┘  └──────────┘
```

---

## 2. 核心概念与术语

| 术语 | 英文 | 说明 |
|------|------|------|
| **用户 (User)** | User | 平台使用者实体，归属于某个租户 |
| **角色 (Role)** | Role | 权限的集合，可分配给用户 |
| **权限 (Permission)** | Permission | 对资源执行某个操作的许可，格式为 `resource:action` |
| **权限组 (Permission Group)** | Permission Group | 权限的逻辑分组，便于管理 |
| **数据范围 (Data Scope)** | Data Scope | 用户可访问的数据边界（全部/本项目/本分组/仅自己） |
| **API Key** | API Key | 程序化访问凭证，绑定权限范围 |
| **超级管理员** | Platform Admin | 平台级管理员，拥有所有租户管理权限 |
| **租户管理员** | Tenant Admin | 租户内最高权限角色 |

---

## 3. 权限模型设计

### 3.1 RBAC 层级结构

```
Platform Admin (超级管理员)  ── 平台级，管理所有租户
  │
  └── Tenant Admin (租户管理员)  ── 租户级，管理本租户所有资源
        │
        ├── Project Admin (项目管理员)  ── 项目级，管理本项目资源
        │     ├── Developer (开发者)  ── 设备管理、规则配置、物模型编辑
        │     ├── Operator (运维人员)  ── 监控、告警、OTA 操作
        │     └── Viewer (只读用户)  ── 只读访问所有资源
        │
        └── Custom Role (自定义角色)  ── 细粒度权限自由组合
```

### 3.2 预置角色定义

| 角色 | 角色代码 | 层级 | 说明 | 是否可删除 |
|------|---------|------|------|-----------|
| 超级管理员 | `PLATFORM_ADMIN` | 平台 | 管理所有租户、系统配置 | ❌ |
| 租户管理员 | `TENANT_ADMIN` | 租户 | 管理本租户所有资源和用户 | ❌ |
| 项目管理员 | `PROJECT_ADMIN` | 项目 | 管理本项目内所有资源 | ❌ |
| 开发者 | `DEVELOPER` | 项目 | 设备管理、规则配置、产品管理 | ❌ |
| 运维人员 | `OPERATOR` | 项目 | 监控、告警、OTA、视频监控 | ❌ |
| 只读用户 | `VIEWER` | 项目 | 所有资源只读访问 | ❌ |

### 3.2.1 角色与前端空间映射

> 前端实际按 `userType` 进行空间隔离：`SYSTEM_OPS` 仅可进入系统运维空间，`TENANT_USER` 仅可进入租户业务空间。  
> 角色用于决定该空间内的菜单与操作权限范围。

| 角色 | 角色代码 | userType | 前端空间 | 典型功能域 | 典型路由 |
|------|---------|----------|----------|------------|----------|
| 超级管理员 | `PLATFORM_ADMIN` | `SYSTEM_OPS` | 系统运维空间 | 租户管理、用户管理、角色权限、权限资源、系统设置、安全审计、系统监控、定时任务 | `/tenant`, `/user`, `/role`, `/permission`, `/settings`, `/security`, `/audit-log`, `/monitor`, `/scheduled-task` |
| 租户管理员 | `TENANT_ADMIN` | `TENANT_USER` | 租户业务空间 | 项目管理、设备中心、规则告警、数据洞察、租户运维工具 | `/project`, `/product`, `/device`, `/rule-engine`, `/alarm`, `/device-data`, `/analysis`, `/firmware`, `/ota`, `/video` |
| 项目管理员 | `PROJECT_ADMIN` | `TENANT_USER` | 租户业务空间 | 项目内资源管理、人员协作、设备与规则配置 | `/project`, `/product`, `/device`, `/device-group`, `/rule-engine`, `/notification` |
| 开发者 | `DEVELOPER` | `TENANT_USER` | 租户业务空间 | 设备接入与产品建模、规则开发、消息调试 | `/product`, `/device`, `/device-shadow`, `/device-message`, `/rule-engine`, `/websocket`, `/modbus`, `/tcp-udp` |
| 运维人员 | `OPERATOR` | `TENANT_USER` | 租户业务空间 | 告警处置、升级发布、视频巡检、运行保障 | `/alarm`, `/notification`, `/ota`, `/firmware`, `/video`, `/export` |
| 只读用户 | `VIEWER` | `TENANT_USER` | 租户业务空间 | 只读查看业务数据与运行状态 | `/dashboard`, `/device`, `/device-data`, `/analysis`, `/alarm` |

### 3.3 权限定义体系

#### 3.3.1 权限格式

```
<resource>:<action>

示例:
  device:create          -- 创建设备
  device:read            -- 查看设备
  device:update          -- 修改设备
  device:delete          -- 删除设备
  device:control         -- 设备控制(下发指令)
  rule:create            -- 创建规则
  rule:enable            -- 启用/禁用规则
  ota:upload             -- 上传固件
  ota:deploy             -- 部署 OTA 任务
  ota:rollback           -- 回滚 OTA
  video:live             -- 实时视频预览
  video:playback         -- 视频回放
  video:ptz              -- 云台控制
  tenant:manage          -- 管理租户配置
  user:create            -- 创建用户
  user:role:assign       -- 分配角色
  share:create           -- 创建共享策略
  share:approve          -- 审批共享策略
  audit:read             -- 查看审计日志
```

#### 3.3.2 完整权限清单

| 权限组 | 权限 | 说明 |
|--------|------|------|
| **设备管理** | `device:create` | 创建设备 |
| | `device:read` | 查看设备详情/列表 |
| | `device:update` | 修改设备信息 |
| | `device:delete` | 删除设备 |
| | `device:control` | 下发指令/设置属性 |
| | `device:debug` | 在线调试 |
| | `device:import` | 批量导入设备 |
| | `device:export` | 导出设备列表 |
| **产品管理** | `product:create` | 创建产品 |
| | `product:read` | 查看产品 |
| | `product:update` | 修改产品/物模型 |
| | `product:delete` | 删除产品 |
| | `product:publish` | 发布产品 |
| **规则引擎** | `rule:create` | 创建规则 |
| | `rule:read` | 查看规则 |
| | `rule:update` | 修改规则 |
| | `rule:delete` | 删除规则 |
| | `rule:enable` | 启用/禁用规则 |
| | `rule:debug` | 调试运行规则 |
| **告警中心** | `alert:read` | 查看告警 |
| | `alert:config` | 配置告警规则 |
| | `alert:acknowledge` | 确认告警 |
| **OTA 升级** | `ota:read` | 查看固件/任务 |
| | `ota:upload` | 上传固件 |
| | `ota:deploy` | 创建升级任务 |
| | `ota:rollback` | 回滚升级 |
| **视频监控** | `video:live` | 实时预览 |
| | `video:playback` | 历史回放 |
| | `video:ptz` | 云台控制 |
| | `video:record` | 录像管理 |
| | `video:snapshot` | 截图 |
| **用户权限** | `user:create` | 创建用户 |
| | `user:read` | 查看用户 |
| | `user:update` | 修改用户 |
| | `user:delete` | 删除/禁用用户 |
| | `user:role:assign` | 分配角色 |
| | `role:create` | 创建角色 |
| | `role:read` | 查看角色 |
| | `role:update` | 修改角色权限 |
| | `role:delete` | 删除角色 |
| | `apikey:create` | 创建 API Key |
| | `apikey:read` | 查看 API Key |
| | `apikey:delete` | 删除/吊销 API Key |
| **租户管理** | `tenant:read` | 查看租户信息 |
| | `tenant:manage` | 管理租户设置 |
| | `tenant:quota` | 配额管理 |
| | `tenant:billing` | 计费管理 |
| **跨租户共享** | `share:create` | 创建共享策略 |
| | `share:read` | 查看共享策略 |
| | `share:approve` | 审批共享策略 |
| | `share:revoke` | 撤销共享 |
| **数据分析** | `analytics:read` | 查看数据分析 |
| | `analytics:export` | 导出数据 |
| **审计日志** | `audit:read` | 查看审计日志 |
| | `audit:export` | 导出审计报告 |
| **系统设置** | `system:config` | 系统参数配置 |
| | `system:notification` | 通知模板管理 |

#### 3.3.3 预置角色权限矩阵

| 权限 | PLATFORM_ADMIN | TENANT_ADMIN | PROJECT_ADMIN | DEVELOPER | OPERATOR | VIEWER |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| `device:create` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `device:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `device:update` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `device:delete` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `device:control` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `device:debug` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `product:*` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ (read ✅) |
| `rule:*` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ (read ✅) |
| `alert:*` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (read ✅) |
| `ota:*` | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ (read ✅) |
| `video:*` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (live ✅) |
| `user:*` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `role:*` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `tenant:*` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `share:*` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ (read ✅) |
| `audit:read` | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| `system:*` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### 3.4 数据范围控制 (Data Scope)

在 RBAC 基础上，引入数据范围控制实现行级数据权限：

| 数据范围 | 代码 | 说明 |
|---------|------|------|
| **全部数据** | `ALL` | 可访问本租户所有数据 |
| **本项目数据** | `PROJECT` | 仅能访问所在项目的数据 |
| **本分组数据** | `GROUP` | 仅能访问所在设备分组的数据 |
| **仅个人数据** | `SELF` | 仅能访问自己创建的数据 |
| **自定义** | `CUSTOM` | 自定义数据范围（指定项目/分组 ID 列表） |

```json
{
  "roleId": "role_custom_001",
  "dataScope": {
    "type": "CUSTOM",
    "projectIds": ["proj_001", "proj_002"],
    "groupIds": ["group_factory_01"]
  }
}
```

### 3.5 权限校验流程

```
请求到达
  │
  ▼
┌─────────────────┐
│ Gateway 层      │
│ 1. 校验 Token   │
│ 2. 解析 JWT     │
│    (userId,     │
│     tenantId,   │
│     roles)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 权限拦截器       │
│ (AOP / Filter)  │
│ 1. 提取接口注解  │
│    @RequiresPerm │
│    ("device:    │
│      create")   │
│ 2. 查询用户权限  │
│    (Cache优先)  │
│ 3. 匹配校验     │
│ 4. 数据范围注入  │
└────────┬────────┘
         │
    ┌────┴────┐
    │ 通过?   │
    ├─ YES ──► 执行业务逻辑 (SQL 自动追加数据范围条件)
    └─ NO ───► 返回 403 Forbidden
```

---

## 4. 数据库设计

### 4.1 ER 图

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│     users        │     │   user_roles     │     │     roles        │
├──────────────────┤     ├──────────────────┤     ├──────────────────┤
│ id (PK, BIGINT)  │◄──┐ │ id (PK)          │ ┌──►│ id (PK, BIGINT)  │
│ tenant_id (FK)   │   └─│ user_id (FK)     │ │   │ tenant_id (FK)   │
│ username         │     │ role_id (FK)     │─┘   │ code             │
│ password_hash    │     │ project_id       │     │ name             │
│ phone            │     │ created_at       │     │ description      │
│ email            │     └──────────────────┘     │ type             │
│ avatar_url       │                               │ (PRESET/CUSTOM)  │
│ real_name        │     ┌──────────────────┐     │ data_scope       │
│ status           │     │ role_permissions │     │ data_scope_config│
│ (ACTIVE/DISABLED/│     ├──────────────────┤     │ (JSONB)          │
│  LOCKED)         │     │ id (PK)          │     │ is_system        │
│ password_changed │     │ role_id (FK)     │─────│ status           │
│ _at              │     │ permission (STR) │     │ created_by       │
│ login_fail_count │     │ created_at       │     │ created_at       │
│ lock_until       │     └──────────────────┘     │ updated_at       │
│ created_by       │                               └──────────────────┘
│ created_at       │
│ updated_at       │     ┌──────────────────┐
│ deleted_at       │     │ permission_groups │
└──────────────────┘     ├──────────────────┤
                          │ id (PK)          │
┌──────────────────┐     │ code             │
│   api_keys       │     │ name             │
├──────────────────┤     │ description      │
│ id (PK, BIGINT)  │     │ permissions      │
│ tenant_id (FK)   │     │ (JSONB, string[])│
│ user_id (FK)     │     │ sort_order       │
│ name             │     └──────────────────┘
│ key_prefix       │
│ key_hash         │     ┌──────────────────────┐
│ permissions      │     │ permission_audit_logs│
│ (JSONB)          │     ├──────────────────────┤
│ expires_at       │     │ id (PK, BIGINT)      │
│ last_used_at     │     │ tenant_id            │
│ last_used_ip     │     │ operator_id          │
│ status           │     │ target_type          │
│ (ACTIVE/REVOKED) │     │ (USER/ROLE/APIKEY)   │
│ created_at       │     │ target_id            │
│ revoked_at       │     │ action               │
└──────────────────┘     │ (CREATE/UPDATE/      │
                          │  DELETE/ASSIGN/      │
                          │  REVOKE)             │
                          │ before_value (JSONB) │
                          │ after_value (JSONB)  │
                          │ ip_address           │
                          │ user_agent           │
                          │ created_at           │
                          └──────────────────────┘
```

### 4.2 DDL 语句

```sql
-- ============================================================
-- 角色表
-- ============================================================
CREATE TABLE roles (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
    code            VARCHAR(64) NOT NULL,
    name            VARCHAR(128) NOT NULL,
    description     VARCHAR(512),
    type            VARCHAR(16) NOT NULL DEFAULT 'CUSTOM',  -- PRESET / CUSTOM
    data_scope      VARCHAR(16) NOT NULL DEFAULT 'PROJECT', -- ALL / PROJECT / GROUP / SELF / CUSTOM
    data_scope_config JSONB,                                 -- 自定义数据范围配置
    is_system       BOOLEAN NOT NULL DEFAULT FALSE,
    status          VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uk_role_tenant_code UNIQUE (tenant_id, code)
);

-- RLS 策略
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_tenant_isolation ON roles
    USING (tenant_id = current_setting('app.tenant_id')::BIGINT);

-- ============================================================
-- 角色权限关联表
-- ============================================================
CREATE TABLE role_permissions (
    id              BIGSERIAL PRIMARY KEY,
    role_id         BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission      VARCHAR(128) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uk_role_permission UNIQUE (role_id, permission)
);

CREATE INDEX idx_role_perm_role ON role_permissions(role_id);

-- ============================================================
-- 用户-角色关联表
-- ============================================================
CREATE TABLE user_roles (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    project_id      BIGINT,  -- 项目级角色时关联项目ID，租户级角色此字段为NULL
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uk_user_role_project UNIQUE (user_id, role_id, project_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

-- ============================================================
-- 权限分组表 (管理用途，非运行时表)
-- ============================================================
CREATE TABLE permission_groups (
    id              BIGSERIAL PRIMARY KEY,
    code            VARCHAR(64) NOT NULL UNIQUE,
    name            VARCHAR(128) NOT NULL,
    description     VARCHAR(512),
    permissions     JSONB NOT NULL DEFAULT '[]',  -- 权限列表
    sort_order      INT NOT NULL DEFAULT 0
);

-- ============================================================
-- API Key 表
-- ============================================================
CREATE TABLE api_keys (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
    user_id         BIGINT NOT NULL REFERENCES users(id),
    name            VARCHAR(128) NOT NULL,
    key_prefix      VARCHAR(8) NOT NULL,      -- Key 前缀用于识别 (如 "ffly_")
    key_hash        VARCHAR(256) NOT NULL,     -- SHA-256 哈希存储
    permissions     JSONB NOT NULL DEFAULT '[]',
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    last_used_ip    VARCHAR(45),
    status          VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE / REVOKED
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ,

    CONSTRAINT uk_apikey_prefix UNIQUE (key_prefix)
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY apikeys_tenant_isolation ON api_keys
    USING (tenant_id = current_setting('app.tenant_id')::BIGINT);

-- ============================================================
-- 权限审计日志表
-- ============================================================
CREATE TABLE permission_audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    operator_id     BIGINT NOT NULL,
    target_type     VARCHAR(16) NOT NULL,       -- USER / ROLE / APIKEY
    target_id       BIGINT NOT NULL,
    action          VARCHAR(32) NOT NULL,        -- CREATE / UPDATE / DELETE / ASSIGN_ROLE / REVOKE_ROLE
    before_value    JSONB,
    after_value     JSONB,
    ip_address      VARCHAR(45),
    user_agent      VARCHAR(512),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_perm_audit_tenant ON permission_audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_perm_audit_target ON permission_audit_logs(target_type, target_id);
```

### 4.3 初始数据 (Seed Data)

```sql
-- 预置权限分组
INSERT INTO permission_groups (code, name, permissions, sort_order) VALUES
('DEVICE',   '设备管理', '["device:create","device:read","device:update","device:delete","device:control","device:debug","device:import","device:export"]', 1),
('PRODUCT',  '产品管理', '["product:create","product:read","product:update","product:delete","product:publish"]', 2),
('RULE',     '规则引擎', '["rule:create","rule:read","rule:update","rule:delete","rule:enable","rule:debug"]', 3),
('ALERT',    '告警中心', '["alert:read","alert:config","alert:acknowledge"]', 4),
('OTA',      'OTA升级',  '["ota:read","ota:upload","ota:deploy","ota:rollback"]', 5),
('VIDEO',    '视频监控', '["video:live","video:playback","video:ptz","video:record","video:snapshot"]', 6),
('USER',     '用户权限', '["user:create","user:read","user:update","user:delete","user:role:assign","role:create","role:read","role:update","role:delete","apikey:create","apikey:read","apikey:delete"]', 7),
('TENANT',   '租户管理', '["tenant:read","tenant:manage","tenant:quota","tenant:billing"]', 8),
('SHARE',    '跨租户共享', '["share:create","share:read","share:approve","share:revoke"]', 9),
('ANALYTICS','数据分析', '["analytics:read","analytics:export"]', 10),
('AUDIT',    '审计日志', '["audit:read","audit:export"]', 11),
('SYSTEM',   '系统设置', '["system:config","system:notification"]', 12);
```

---

## 5. 核心流程设计

### 5.1 用户创建流程

```
租户管理员/项目管理员
        │
        ▼
  POST /api/v1/users
  {
    "username": "zhangsan",
    "phone": "13800138000",
    "email": "zhangsan@example.com",
    "realName": "张三",
    "password": "初始密码(可选，可系统生成)",
    "roleIds": [{ "roleId": 10, "projectId": 1 }]
  }
        │
        ▼
  ┌─────────────────┐
  │ 参数校验         │
  │ - 用户名唯一     │
  │ - 手机号格式     │
  │ - 邮箱格式       │
  │ - 角色是否存在   │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │ 权限校验         │
  │ 操作者 ≥ 被分配  │
  │ 角色的层级       │
  │ (防止越权)       │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │ 创建用户         │
  │ - 密码 BCrypt    │
  │ - 默认状态 ACTIVE│
  │ - 关联角色       │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │ 发送通知         │
  │ - 邮件/短信     │
  │ - 初始密码       │
  │ - 首次登录强制   │
  │   修改密码       │
  └────────┬────────┘
           │
           ▼
  记录审计日志
```

### 5.2 角色创建与权限分配

```
租户管理员
    │
    ▼
POST /api/v1/roles
{
  "name": "工厂运维主管",
  "code": "factory_ops_lead",
  "description": "负责工厂设备监控和OTA升级",
  "dataScope": "CUSTOM",
  "dataScopeConfig": {
    "projectIds": [1],
    "groupIds": ["group_factory_01", "group_factory_02"]
  },
  "permissions": [
    "device:read", "device:control",
    "alert:*",
    "ota:*",
    "video:live", "video:playback",
    "audit:read"
  ]
}
    │
    ▼
┌──────────────────┐
│ 校验              │
│ - 角色名/代码唯一 │
│ - 权限列表合法    │
│ - 操作者自身拥有  │
│   所分配的权限    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 通配符展开        │
│ "alert:*" →      │
│   alert:read,    │
│   alert:config,  │
│   alert:acknowledge│
└────────┬─────────┘
         │
         ▼
写入 roles + role_permissions 表
记录审计日志
清除相关用户权限缓存
```

### 5.3 权限校验流程 (运行时)

```java
// 注解方式
@RequiresPermission("device:create")
@PostMapping("/api/v1/devices")
public DeviceVO createDevice(@RequestBody DeviceCreateDTO dto) {
    // 业务逻辑
}

// 权限拦截器伪代码
public class PermissionInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest req, ...) {
        // 1. 从 SecurityContext 获取当前用户
        UserContext ctx = SecurityContextHolder.getContext();

        // 2. 获取接口需要的权限
        RequiresPermission ann = getAnnotation(handler);
        String requiredPerm = ann.value();

        // 3. 查询用户权限 (优先从缓存读取)
        Set<String> userPerms = permissionService.getUserPermissions(
            ctx.getUserId(), ctx.getTenantId()
        );

        // 4. 校验
        if (!userPerms.contains(requiredPerm)) {
            throw new ForbiddenException("权限不足: " + requiredPerm);
        }

        // 5. 注入数据范围到线程上下文
        DataScope scope = permissionService.getDataScope(ctx.getUserId());
        DataScopeHolder.set(scope);

        return true;
    }
}
```

### 5.4 数据范围过滤 (MyBatis 拦截器)

```java
// 自动追加数据范围条件
@Intercepts({@Signature(type = Executor.class, method = "query", ...)})
public class DataScopeInterceptor implements Interceptor {

    @Override
    public Object intercept(Invocation invocation) {
        DataScope scope = DataScopeHolder.get();
        if (scope == null || scope.getType() == DataScopeType.ALL) {
            return invocation.proceed();
        }

        // 修改 SQL，追加过滤条件
        BoundSql boundSql = ...;
        String originalSql = boundSql.getSql();

        switch (scope.getType()) {
            case PROJECT:
                // WHERE ... AND project_id IN (用户关联的项目ID)
                break;
            case GROUP:
                // WHERE ... AND group_id IN (配置的分组ID)
                break;
            case SELF:
                // WHERE ... AND created_by = #{userId}
                break;
            case CUSTOM:
                // WHERE ... AND (project_id IN (...) OR group_id IN (...))
                break;
        }
        return invocation.proceed();
    }
}
```

### 5.5 API Key 管理流程

```
用户请求创建 API Key
        │
        ▼
  POST /api/v1/api-keys
  {
    "name": "生产环境数据采集",
    "permissions": ["device:read", "analytics:read"],
    "expiresAt": "2027-02-25T00:00:00Z"
  }
        │
        ▼
  ┌───────────────────────┐
  │ 1. 生成 Key           │
  │    ffly_xxxxxxxx...   │
  │    (前缀 + 32位随机)   │
  │ 2. SHA-256 哈希存储    │
  │ 3. 原始 Key 仅返回一次│
  └───────────┬───────────┘
              │
              ▼
  ┌───────────────────────┐
  │ 权限校验               │
  │ API Key 权限不能超过   │
  │ 用户自身权限            │
  └───────────┬───────────┘
              │
              ▼
  返回 { id, name, key: "ffly_xxxxx...", expiresAt }
  ⚠️ key 仅在此时返回明文，后续不可再查看
```

---

## 6. API 接口设计

### 6.1 用户管理 API

| 接口 | 方法 | 说明 | 所需权限 |
|------|------|------|---------|
| `/api/v1/users` | GET | 用户列表 (分页/搜索) | `user:read` |
| `/api/v1/users` | POST | 创建用户 | `user:create` |
| `/api/v1/users/{id}` | GET | 用户详情 | `user:read` |
| `/api/v1/users/{id}` | PUT | 修改用户 | `user:update` |
| `/api/v1/users/{id}` | DELETE | 删除用户 (逻辑) | `user:delete` |
| `/api/v1/users/{id}/status` | PUT | 启用/禁用用户 | `user:update` |
| `/api/v1/users/{id}/roles` | GET | 查询用户角色 | `user:read` |
| `/api/v1/users/{id}/roles` | PUT | 分配/修改用户角色 | `user:role:assign` |
| `/api/v1/users/{id}/reset-password` | POST | 重置密码 | `user:update` |
| `/api/v1/users/me` | GET | 获取当前用户信息 | 登录即可 |
| `/api/v1/users/me` | PUT | 修改个人信息 | 登录即可 |
| `/api/v1/users/me/password` | PUT | 修改自己密码 | 登录即可 |
| `/api/v1/users/me/permissions` | GET | 查询自己的权限列表 | 登录即可 |

### 6.2 角色管理 API

| 接口 | 方法 | 说明 | 所需权限 |
|------|------|------|---------|
| `/api/v1/roles` | GET | 角色列表 | `role:read` |
| `/api/v1/roles` | POST | 创建自定义角色 | `role:create` |
| `/api/v1/roles/{id}` | GET | 角色详情 (含权限列表) | `role:read` |
| `/api/v1/roles/{id}` | PUT | 修改角色 | `role:update` |
| `/api/v1/roles/{id}` | DELETE | 删除角色 | `role:delete` |
| `/api/v1/roles/{id}/users` | GET | 查询角色下用户 | `role:read` |

### 6.3 权限查询 API

| 接口 | 方法 | 说明 | 所需权限 |
|------|------|------|---------|
| `/api/v1/permissions` | GET | 获取全部权限定义列表 | `role:read` |
| `/api/v1/permissions/groups` | GET | 获取权限分组列表 | `role:read` |

### 6.4 API Key 管理 API

| 接口 | 方法 | 说明 | 所需权限 |
|------|------|------|---------|
| `/api/v1/api-keys` | GET | API Key 列表 | `apikey:read` |
| `/api/v1/api-keys` | POST | 创建 API Key | `apikey:create` |
| `/api/v1/api-keys/{id}` | GET | API Key 详情 | `apikey:read` |
| `/api/v1/api-keys/{id}/revoke` | POST | 吊销 API Key | `apikey:delete` |

### 6.5 请求/响应示例

#### 创建用户

```http
POST /api/v1/users
Content-Type: application/json
Authorization: Bearer {access_token}
X-Tenant-Id: t_001

{
  "username": "zhangsan",
  "phone": "13800138000",
  "email": "zhangsan@example.com",
  "realName": "张三",
  "password": "Abc@123456",
  "roles": [
    { "roleId": 5, "projectId": 1 },
    { "roleId": 6, "projectId": 2 }
  ]
}
```

**响应 (201 Created):**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": 1001,
    "username": "zhangsan",
    "phone": "138****8000",
    "email": "zhangsan@example.com",
    "realName": "张三",
    "status": "ACTIVE",
    "roles": [
      { "roleId": 5, "roleName": "开发者", "projectId": 1, "projectName": "智慧工厂" },
      { "roleId": 6, "roleName": "运维人员", "projectId": 2, "projectName": "智慧园区" }
    ],
    "createdAt": "2026-02-25T10:00:00Z"
  }
}
```

#### 创建自定义角色

```http
POST /api/v1/roles
Content-Type: application/json

{
  "name": "工厂运维主管",
  "code": "factory_ops_lead",
  "description": "负责工厂设备监控和OTA升级",
  "dataScope": "CUSTOM",
  "dataScopeConfig": {
    "projectIds": [1],
    "groupIds": ["group_factory_01"]
  },
  "permissions": [
    "device:read", "device:control",
    "alert:read", "alert:config", "alert:acknowledge",
    "ota:read", "ota:upload", "ota:deploy",
    "video:live", "video:playback",
    "audit:read"
  ]
}
```

**响应 (201 Created):**

```json
{
  "code": 0,
  "data": {
    "id": 100,
    "code": "factory_ops_lead",
    "name": "工厂运维主管",
    "type": "CUSTOM",
    "dataScope": "CUSTOM",
    "permissionCount": 11,
    "userCount": 0,
    "createdAt": "2026-02-25T10:00:00Z"
  }
}
```

---

## 7. 缓存策略

### 7.1 缓存结构

| 缓存 Key | 存储内容 | TTL | 失效策略 |
|---------|---------|-----|---------|
| `perm:user:{userId}` | 用户完整权限集合 `Set<String>` | 30 min | 角色变更/权限变更时主动删除 |
| `perm:role:{roleId}` | 角色权限列表 | 1 h | 角色修改时主动删除 |
| `perm:scope:{userId}` | 用户数据范围配置 | 30 min | 同上 |
| `user:info:{userId}` | 用户基本信息 | 1 h | 用户信息修改时删除 |

### 7.2 缓存更新策略

```
权限变更事件 (角色修改/用户角色变更)
        │
        ▼
  ┌─────────────────┐
  │ 1. 更新数据库    │
  │ 2. 发布事件到    │
  │    Kafka         │
  │    topic:        │
  │    permission_   │
  │    change        │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │ 所有实例监听事件 │
  │ 删除本地缓存 L1  │
  │ 删除 Redis 缓存  │
  │ L2              │
  └─────────────────┘
```

### 7.3 二级缓存实现

```
请求权限校验
    │
    ▼
┌─────────────┐    命中    ┌──────────┐
│ L1 本地缓存  │ ────────► │ 返回结果  │
│ (Caffeine)  │           └──────────┘
│ TTL: 5 min  │
└──────┬──────┘
       │ 未命中
       ▼
┌─────────────┐    命中    ┌──────────┐
│ L2 Redis    │ ────────► │ 写入 L1   │
│ TTL: 30 min │           │ 返回结果  │
└──────┬──────┘           └──────────┘
       │ 未命中
       ▼
┌─────────────┐
│ 数据库查询   │ ────────► 写入 L1 + L2，返回结果
└─────────────┘
```

---

## 8. 安全设计

### 8.1 密码策略

| 策略 | 默认值 | 说明 |
|------|-------|------|
| **最小长度** | 8 | 至少 8 位 |
| **复杂度** | 至少 3/4 | 大写、小写、数字、特殊字符至少满足 3 种 |
| **历史密码** | 5 | 新密码不能与最近 5 次相同 |
| **有效期** | 90 天 | 超过 90 天强制修改 (可配) |
| **首次登录** | 强制修改 | 管理员创建的用户首次登录需修改密码 |
| **哈希算法** | BCrypt | cost factor = 12 |

### 8.2 账号安全

| 策略 | 说明 |
|------|------|
| **登录失败锁定** | 连续 5 次密码错误，锁定 30 分钟 |
| **异地登录检测** | IP 地理位置变化时发送告警通知 |
| **长时间未登录** | 超过 90 天未登录的账号自动禁用 |
| **操作二次确认** | 高危操作 (删除用户/修改角色) 需二次密码确认 |

### 8.3 越权防护

| 防护措施 | 说明 |
|---------|------|
| **垂直越权** | 注解式权限校验，接口级拦截 |
| **水平越权** | 数据范围拦截器，SQL 级租户隔离 |
| **角色分配越权** | 只能分配自己拥有权限的子集对应角色 |
| **API Key 越权** | API Key 权限不超过创建者权限 |

---

## 9. 前端交互设计

### 9.1 用户管理页面

```
┌──────────────────────────────────────────────────────────────┐
│ 用户管理                                    [+ 创建用户]      │
├──────────────────────────────────────────────────────────────┤
│ 搜索: [用户名/手机号/邮箱___________] 状态: [全部 ▼]  [搜索] │
├──────────────────────────────────────────────────────────────┤
│ ☐ │ 用户名    │ 手机号       │ 角色      │ 状态   │ 操作     │
│───┼───────────┼─────────────┼───────────┼────────┼──────────│
│ ☐ │ zhangsan  │ 138****8000 │ 开发者    │ ✅正常  │ 编辑 更多│
│ ☐ │ lisi      │ 139****9000 │ 运维人员  │ ✅正常  │ 编辑 更多│
│ ☐ │ wangwu    │ 137****7000 │ 只读用户  │ 🚫禁用  │ 编辑 更多│
├──────────────────────────────────────────────────────────────┤
│                    共 3 条  < 1 >                             │
└──────────────────────────────────────────────────────────────┘

"更多" 下拉菜单:
  - 分配角色
  - 重置密码
  - 禁用/启用
  - 查看审计日志
  - 删除
```

### 9.2 角色管理页面

```
┌──────────────────────────────────────────────────────────────┐
│ 角色管理                                    [+ 创建角色]      │
├──────────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐ ┌──────────────────────────────────┐│
│ │ 角色列表             │ │ 角色详情: 工厂运维主管            ││
│ │                     │ │                                  ││
│ │ 🔒 超级管理员 (系统) │ │ 基本信息:                        ││
│ │ 🔒 租户管理员 (系统) │ │   代码: factory_ops_lead         ││
│ │ 🔒 项目管理员 (系统) │ │   类型: 自定义                   ││
│ │ 🔒 开发者 (系统)     │ │   数据范围: 自定义               ││
│ │ 🔒 运维人员 (系统)   │ │   用户数: 3                      ││
│ │ 🔒 只读用户 (系统)   │ │                                  ││
│ │ ✏️ 工厂运维主管      │ │ 权限配置:                        ││
│ │ ✏️ 数据分析员        │ │ ☑ 设备管理                       ││
│ │                     │ │   ☑ 查看设备  ☑ 设备控制         ││
│ │                     │ │   ☐ 创建设备  ☐ 修改设备         ││
│ │                     │ │ ☑ 告警中心                       ││
│ │                     │ │   ☑ 查看告警  ☑ 告警配置         ││
│ │                     │ │ ☑ OTA 升级                       ││
│ │                     │ │   ☑ 查看  ☑ 上传  ☑ 部署        ││
│ │                     │ │ ...                              ││
│ │                     │ │                  [保存] [取消]    ││
│ └─────────────────────┘ └──────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### 9.3 API Key 管理页面

```
┌──────────────────────────────────────────────────────────────┐
│ API Key 管理                               [+ 创建 API Key]  │
├──────────────────────────────────────────────────────────────┤
│ 名称           │ Key 前缀     │ 权限数 │ 到期时间    │ 操作   │
│────────────────┼─────────────┼────────┼────────────┼────────│
│ 生产环境采集    │ ffly_a3b2.. │ 2      │ 2027-02-25 │ 吊销   │
│ 测试环境        │ ffly_x8y7.. │ 5      │ 永不过期    │ 吊销   │
├──────────────────────────────────────────────────────────────┤
│ ⚠️ API Key 创建后仅显示一次，请妥善保管                       │
└──────────────────────────────────────────────────────────────┘
```

---

## 10. 非功能性需求

### 10.1 性能要求

| 指标 | 要求 |
|------|------|
| 权限校验延迟 | ≤ 5 ms (缓存命中) |
| 用户列表查询 | ≤ 200 ms (P99) |
| 角色创建/修改 | ≤ 500 ms |
| 缓存失效传播 | ≤ 1 s (集群内所有节点) |

### 10.2 可扩展性

- 权限定义采用 `resource:action` 格式，新增业务模块只需注册新权限项
- 支持通配符 `*` 简化配置（如 `device:*` 表示设备相关所有权限）
- 数据范围策略可插件化扩展

### 10.3 兼容性

- 所有 API 遵循 RESTful 规范，JSON 格式
- 支持 OpenAPI 3.1 自动生成文档
- 与多平台登录模块共享用户实体，Session 与权限互通

---

> **文档维护**: 本文档随项目迭代持续更新，最新版本请以仓库 `docs/design/detailed-design-user-permissions.md` 为准。
