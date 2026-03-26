# Firefly-IoT API 文档模块 — 详细设计文档

> **版本**: v1.0.0  
> **日期**: 2026-02-26  
> **状态**: Draft  
> **关联**: [产品设计文档](./product-design.md) §14 开放能力与集成、§15.1 API 文档

---

## 目录

1. [模块概述](#1-模块概述)
2. [核心概念与术语](#2-核心概念与术语)
3. [功能设计](#3-功能设计)
4. [数据库设计](#4-数据库设计)
5. [API Key 管理](#5-api-key-管理)
6. [OpenAPI 文档集成](#6-openapi-文档集成)
7. [API 接口设计](#7-api-接口设计)
8. [API 调用日志与统计](#8-api-调用日志与统计)
9. [安全设计](#9-安全设计)
10. [前端交互设计](#10-前端交互设计)
11. [非功能性需求](#11-非功能性需求)

---

## 1. 模块概述

### 1.1 模块定位

API 文档模块是 Firefly-IoT 平台的 **开放能力入口**，为租户提供 API Key 管理、在线 API 文档浏览与调试、API 调用统计等能力。该模块支撑平台对外 Open API 体系，使第三方系统能够安全、可控地集成 Firefly-IoT 的设备管理、数据查询、规则管理等能力。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| **API Key 管理** | 创建、查看、启停、删除 API Key；支持权限范围和有效期配置 |
| **在线 API 文档** | 内嵌 Swagger UI / Redoc，按模块分类展示所有 REST API |
| **在线调试** | Swagger UI 内置 Try It Out 功能，支持 API Key / JWT 两种认证调试 |
| **API 调用日志** | 记录每次 API 调用的请求/响应摘要，支持按租户、Key、时间范围查询 |
| **调用统计** | 按 API Key / 接口 / 时间维度统计调用量、成功率、延迟分布 |
| **速率限制** | 按 API Key 维度限流，防止单个 Key 耗尽租户配额 |

### 1.3 模块依赖关系

```
┌──────────────────────────────────────────────────────────────┐
│                      API Gateway                              │
│           (API Key 认证 + 限流 + 调用日志采集)                 │
└───────────────────────┬──────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────┐
│                    API 文档模块                                 │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐     │
│  │ API Key 管理  │  │ OpenAPI 文档  │  │ 调用日志与统计   │     │
│  └──────────────┘  └──────────────┘  └──────────────────┘     │
└───────────────────────┬──────────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ 用户权限  │  │ 租户管理  │  │ 设备管理  │
    │ 模块     │  │ 模块     │  │ 等业务API │
    └──────────┘  └──────────┘  └──────────┘
```

---

## 2. 核心概念与术语

| 术语 | 英文 | 说明 |
|------|------|------|
| **API Key** | API Key | 用于第三方系统调用平台 API 的密钥凭证，由 accessKey + secretKey 组成 |
| **accessKey** | Access Key | API Key 的公开标识部分，用于传递身份（相当于用户名） |
| **secretKey** | Secret Key | API Key 的私密部分，用于签名验证（仅创建时显示一次） |
| **权限范围 (Scope)** | Permission Scope | API Key 被授予的操作权限集合（如 device:read, rule:*） |
| **调用配额** | Rate Limit | 单个 API Key 每分钟/每天的最大请求数 |
| **API 调用日志** | API Access Log | 记录每次 API 调用的请求方法、路径、状态码、耗时等 |

---

## 3. 功能设计

### 3.1 API Key 生命周期

```
创建 (ACTIVE) ──► 使用中 ──► 暂停 (DISABLED) ──► 恢复 (ACTIVE) ──► 删除 (DELETED)
                                                                        │
                                                                   逻辑删除
```

### 3.2 API Key 认证流程

```
客户端请求
  │
  │  Header: X-Access-Key: ak_xxxx
  │  Header: X-Signature: HMAC-SHA256(secretKey, requestBody + timestamp)
  │  Header: X-Timestamp: 1740412800000
  │
  ▼
API Gateway
  │
  ├── 1. 提取 X-Access-Key
  ├── 2. 从 Redis 查询 API Key 详情 (含 secretKey, tenantId, scopes)
  ├── 3. 验证签名 (HMAC-SHA256)
  ├── 4. 验证时间戳有效性 (±5分钟)
  ├── 5. 检查 API Key 状态 (ACTIVE)
  ├── 6. 检查有效期 (expireAt)
  ├── 7. 检查权限范围 (scopes vs 请求的接口)
  ├── 8. 检查速率限制 (Redis 滑动窗口)
  │
  ├── 通过 → 注入 X-Tenant-Id, X-Api-Key-Id 到请求头 → 转发到后端服务
  └── 失败 → 返回 401/403/429
```

### 3.3 功能列表

| 功能 | 说明 | 权限 |
|------|------|------|
| 创建 API Key | 指定名称、描述、权限范围、有效期、速率限制 | `apikey:create` |
| 查看 API Key 列表 | 分页查询当前租户的所有 API Key | `apikey:read` |
| 查看 API Key 详情 | 查看单个 API Key 详情（不含 secretKey） | `apikey:read` |
| 启用/禁用 API Key | 切换 API Key 状态 | `apikey:update` |
| 删除 API Key | 逻辑删除 API Key | `apikey:delete` |
| 查看 API 调用日志 | 按 Key、时间范围、接口路径查询调用记录 | `apikey:read` |
| 查看调用统计 | 按天/小时维度查看调用量、成功率、延迟 | `apikey:read` |
| 浏览 API 文档 | Swagger UI / Redoc 在线文档 | 登录即可 |
| 在线调试 API | Swagger UI Try It Out | 登录即可 |

---

## 4. 数据库设计

### 4.1 ER 图

```
┌────────────────────────┐     ┌────────────────────────┐
│      api_keys          │     │   api_access_logs      │
├────────────────────────┤     ├────────────────────────┤
│ id (PK, BIGINT)        │◄──┐ │ id (PK, BIGINT)        │
│ tenant_id (FK)         │   │ │ api_key_id (FK)        │───┘
│ name (VARCHAR 128)     │   │ │ tenant_id              │
│ description (TEXT)     │   │ │ method (VARCHAR 10)    │
│ access_key (VARCHAR 64)│   │ │ path (VARCHAR 512)     │
│ secret_key_hash (TEXT) │   │ │ status_code (INT)      │
│ scopes (JSONB)         │   │ │ latency_ms (INT)       │
│ rate_limit_per_min(INT)│   │ │ client_ip (VARCHAR 64) │
│ rate_limit_per_day(INT)│   │ │ request_size (INT)     │
│ status (VARCHAR 20)    │   │ │ response_size (INT)    │
│ expire_at (TIMESTAMP)  │   │ │ error_message (TEXT)   │
│ last_used_at(TIMESTAMP)│   │ │ created_at (TIMESTAMP) │
│ created_by (BIGINT)    │   │ └────────────────────────┘
│ created_at (TIMESTAMP) │   │
│ updated_at (TIMESTAMP) │   │ ┌────────────────────────┐
│ deleted_at (TIMESTAMP) │   │ │ api_call_stats_daily   │
└────────────────────────┘   │ ├────────────────────────┤
                              │ │ id (PK, BIGINT)        │
                              └─│ api_key_id (FK)        │
                                │ tenant_id              │
                                │ stat_date (DATE)       │
                                │ total_calls (BIGINT)   │
                                │ success_calls (BIGINT) │
                                │ error_calls (BIGINT)   │
                                │ avg_latency_ms (INT)   │
                                │ max_latency_ms (INT)   │
                                │ p99_latency_ms (INT)   │
                                │ created_at (TIMESTAMP) │
                                └────────────────────────┘
```

### 4.2 DDL

```sql
-- API Key 表
CREATE TABLE api_keys (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    access_key      VARCHAR(64) NOT NULL UNIQUE,
    secret_key_hash TEXT NOT NULL,
    scopes          JSONB NOT NULL DEFAULT '["*"]',
    rate_limit_per_min INT NOT NULL DEFAULT 600,
    rate_limit_per_day INT NOT NULL DEFAULT 100000,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    expire_at       TIMESTAMP,
    last_used_at    TIMESTAMP,
    created_by      BIGINT NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMP
);

CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX idx_api_keys_access_key ON api_keys(access_key) WHERE deleted_at IS NULL;

-- API 调用日志表 (考虑按月分区或使用 TimescaleDB)
CREATE TABLE api_access_logs (
    id              BIGSERIAL PRIMARY KEY,
    api_key_id      BIGINT NOT NULL,
    tenant_id       BIGINT NOT NULL,
    method          VARCHAR(10) NOT NULL,
    path            VARCHAR(512) NOT NULL,
    status_code     INT NOT NULL,
    latency_ms      INT NOT NULL,
    client_ip       VARCHAR(64),
    request_size    INT,
    response_size   INT,
    error_message   TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_access_logs_key ON api_access_logs(api_key_id, created_at DESC);
CREATE INDEX idx_api_access_logs_tenant ON api_access_logs(tenant_id, created_at DESC);

-- API 调用统计日报表 (由定时任务每天聚合)
CREATE TABLE api_call_stats_daily (
    id              BIGSERIAL PRIMARY KEY,
    api_key_id      BIGINT NOT NULL,
    tenant_id       BIGINT NOT NULL,
    stat_date       DATE NOT NULL,
    total_calls     BIGINT NOT NULL DEFAULT 0,
    success_calls   BIGINT NOT NULL DEFAULT 0,
    error_calls     BIGINT NOT NULL DEFAULT 0,
    avg_latency_ms  INT NOT NULL DEFAULT 0,
    max_latency_ms  INT NOT NULL DEFAULT 0,
    p99_latency_ms  INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(api_key_id, stat_date)
);
```

---

## 5. API Key 管理

### 5.1 API Key 生成规则

| 字段 | 规则 |
|------|------|
| **accessKey** | `ak_` + 32 位随机字母数字字符串，全局唯一 |
| **secretKey** | `sk_` + 48 位随机字母数字字符串，仅创建时返回一次 |
| **存储** | secretKey 使用 BCrypt 哈希后存储，不可逆 |

### 5.2 权限范围 (Scopes)

Scopes 使用与 RBAC 一致的 `resource:action` 格式：

```json
["device:read", "device:write", "telemetry:read", "rule:*"]
```

特殊值：
- `*` — 全部权限（管理员 Key）
- `device:*` — 设备相关全部权限

### 5.3 速率限制

| 级别 | 默认值 | 可配置 |
|------|--------|--------|
| **每分钟** | 600 次/分 | ✅ 最大 6000 |
| **每天** | 100,000 次/天 | ✅ 最大 1,000,000 |

速率限制使用 Redis 滑动窗口算法实现，Key 格式：`rl:apikey:{accessKey}:min` / `rl:apikey:{accessKey}:day`。

### 5.4 签名算法

```
signature = HMAC-SHA256(secretKey, method + "\n" + path + "\n" + timestamp + "\n" + bodyMd5)
```

| 参数 | 说明 |
|------|------|
| **method** | HTTP 方法大写 (GET/POST/PUT/DELETE) |
| **path** | 请求路径 (如 /api/v1/devices) |
| **timestamp** | Unix 毫秒时间戳 |
| **bodyMd5** | 请求体 MD5 (无 body 则为空字符串的 MD5) |

---

## 6. OpenAPI 文档集成

### 6.1 技术方案

使用 **springdoc-openapi** (v2.x) 自动生成 OpenAPI 3.1 规范文档：

| 组件 | 说明 |
|------|------|
| **springdoc-openapi-starter-webmvc-ui** | 自动扫描 Controller 生成 OpenAPI Spec + 内嵌 Swagger UI |
| **Swagger UI** | 交互式 API 文档，支持 Try It Out 在线调试 |
| **Redoc** | 只读美观文档，适合对外发布 |
| **分组 (Group)** | 按模块分组：系统管理、设备管理、认证鉴权、规则引擎等 |

### 6.2 文档分组

| 分组名称 | 路径模式 | 说明 |
|---------|---------|------|
| **认证鉴权** | `/api/v1/auth/**` | 登录、登出、Token 刷新 |
| **系统管理** | `/api/v1/tenants/**, /api/v1/users/**, /api/v1/roles/**` | 租户、用户、角色管理 |
| **API Key** | `/api/v1/api-keys/**` | API Key 管理 |
| **设备管理** | `/api/v1/devices/**, /api/v1/products/**` | 产品与设备管理 |
| **规则引擎** | `/api/v1/rules/**` | 规则 CRUD 与管理 |
| **数据查询** | `/api/v1/telemetry/**` | 时序数据查询 |
| **视频控制** | `/api/v1/video/**` | 视频流控制与运行态接口 |

### 6.3 文档访问路径

| 路径 | 说明 |
|------|------|
| `/swagger-ui.html` | Swagger UI 交互式文档 |
| `/v3/api-docs` | OpenAPI JSON Spec |
| `/v3/api-docs.yaml` | OpenAPI YAML Spec |
| `/redoc.html` | Redoc 只读文档 (静态页面) |

### 6.4 认证配置

Swagger UI 支持两种认证方式：

1. **Bearer Token (JWT)** — 用户登录后获取的 Access Token
2. **API Key** — 通过 X-Access-Key + X-Signature 头部认证

---

## 7. API 接口设计

### 7.1 API Key 管理接口

#### 7.1.1 创建 API Key

```
POST /api/v1/api-keys
```

请求体：
```json
{
    "name": "数据查询专用 Key",
    "description": "仅用于查询设备数据",
    "scopes": ["device:read", "telemetry:read"],
    "rateLimitPerMin": 600,
    "rateLimitPerDay": 100000,
    "expireAt": "2027-01-01T00:00:00Z"
}
```

响应：
```json
{
    "code": 0,
    "data": {
        "id": 1,
        "name": "数据查询专用 Key",
        "accessKey": "ak_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
        "secretKey": "sk_x1y2z3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3u4v5w6",
        "scopes": ["device:read", "telemetry:read"],
        "rateLimitPerMin": 600,
        "rateLimitPerDay": 100000,
        "status": "ACTIVE",
        "expireAt": "2027-01-01T00:00:00Z",
        "createdAt": "2026-02-26T00:00:00Z"
    }
}
```

> **注意**: `secretKey` 仅在创建时返回一次，之后不再可查。

#### 7.1.2 查询 API Key 列表

```
POST /api/v1/api-keys/list
```

请求体：
```json
{
    "pageNum": 1,
    "pageSize": 20,
    "keyword": "数据",
    "status": "ACTIVE"
}
```

#### 7.1.3 查看 API Key 详情

```
GET /api/v1/api-keys/{id}
```

#### 7.1.4 更新 API Key

```
PUT /api/v1/api-keys/{id}
```

请求体：
```json
{
    "name": "更新后名称",
    "description": "更新后描述",
    "scopes": ["*"],
    "rateLimitPerMin": 1200
}
```

#### 7.1.5 启用/禁用 API Key

```
PUT /api/v1/api-keys/{id}/status?status=DISABLED
```

#### 7.1.6 删除 API Key

```
DELETE /api/v1/api-keys/{id}
```

### 7.2 API 调用日志接口

#### 7.2.1 查询调用日志

```
POST /api/v1/api-keys/{id}/logs
```

请求体：
```json
{
    "pageNum": 1,
    "pageSize": 50,
    "startTime": "2026-02-25T00:00:00Z",
    "endTime": "2026-02-26T00:00:00Z",
    "method": "GET",
    "path": "/api/v1/devices",
    "statusCode": 200
}
```

#### 7.2.2 查询调用统计

```
GET /api/v1/api-keys/{id}/stats?startDate=2026-02-01&endDate=2026-02-28
```

响应：
```json
{
    "code": 0,
    "data": [
        {
            "statDate": "2026-02-25",
            "totalCalls": 15230,
            "successCalls": 14980,
            "errorCalls": 250,
            "avgLatencyMs": 45,
            "maxLatencyMs": 1200,
            "p99LatencyMs": 320
        }
    ]
}
```

---

## 8. API 调用日志与统计

### 8.1 日志采集

API 调用日志由 **API Gateway** 在请求完成后异步写入 Kafka Topic `firefly.api.access.logs`，由 API 文档模块消费后写入数据库。

```
客户端 → Gateway (记录请求开始时间)
         → 后端服务处理
         → Gateway (计算耗时，异步发送日志到 Kafka)
                          → API Access Log Consumer → api_access_logs 表
```

### 8.2 统计聚合

- **实时统计**: Redis HyperLogLog 统计当日 UV，INCR 统计调用次数
- **日报聚合**: 每日凌晨定时任务聚合前一天日志写入 `api_call_stats_daily`
- **数据保留**: 明细日志保留 30 天，日报统计永久保留

### 8.3 告警规则

| 告警 | 条件 | 通知方式 |
|------|------|---------|
| API Key 调用异常 | 5分钟内错误率 > 50% | 邮件/Webhook |
| 配额即将耗尽 | 当日调用量 > 每日限额的 80% | 邮件 |
| API Key 即将过期 | 距过期时间 < 7 天 | 邮件 |

---

## 9. 安全设计

### 9.1 密钥安全

| 安全措施 | 说明 |
|---------|------|
| **SecretKey 不可逆存储** | BCrypt 哈希存储，仅创建时明文返回一次 |
| **传输加密** | 所有 API 通信强制 HTTPS/TLS 1.3 |
| **签名防重放** | Timestamp 校验 ±5 分钟有效窗口 |
| **IP 白名单** | 可选配置 API Key 允许的来源 IP 列表 |
| **操作审计** | API Key 创建、修改、删除均记录操作审计日志 |

### 9.2 权限隔离

- API Key 只能访问所属租户的数据 (tenant_id 绑定)
- API Key 的 scopes 不能超过创建者自身的权限范围
- 被禁用的 API Key 立即失效 (Gateway 从 Redis 查询实时状态)

---

## 10. 前端交互设计

### 10.1 API 文档页面

```
┌─────────────────────────────────────────────────────────┐
│  API 文档中心                                             │
├──────────┬──────────────────────────────────────────────┤
│  模块导航  │  ┌──────────────────────────────────┐        │
│          │  │  Swagger UI / Redoc 嵌入          │        │
│ □ 认证鉴权│  │                                    │        │
│ □ 系统管理│  │  [接口列表]                          │        │
│ □ API Key│  │  POST /api/v1/auth/login            │        │
│ □ 设备管理│  │  GET  /api/v1/devices/{id}          │        │
│ □ 规则引擎│  │  ...                                │        │
│ □ 数据查询│  │                                    │        │
│ □ 视频监控│  │  [Try It Out] [Authorization]       │        │
│          │  └──────────────────────────────────┘        │
└──────────┴──────────────────────────────────────────────┘
```

### 10.2 API Key 管理页面

```
┌─────────────────────────────────────────────────────────┐
│  API Key 管理                          [+ 创建 API Key]  │
├─────────────────────────────────────────────────────────┤
│  名称          Access Key              状态   创建时间    │
│  ──────────────────────────────────────────────────────  │
│  数据查询Key   ak_a1b2c3...p6          活跃   2026-02-25 │
│  规则管理Key   ak_x7y8z9...w0          禁用   2026-02-20 │
│                                                          │
│  [详情] [编辑] [启用/禁用] [调用日志] [统计] [删除]        │
└─────────────────────────────────────────────────────────┘
```

---

## 11. 非功能性需求

| 需求 | 指标 |
|------|------|
| **API Key 创建延迟** | P99 < 500ms |
| **签名验证延迟** | P99 < 5ms (Redis 缓存) |
| **日志写入吞吐** | ≥ 10,000 条/秒 (Kafka 异步) |
| **API Key 数量** | 每租户最多 50 个 |
| **调用日志保留** | 明细 30 天，统计永久 |
| **可用性** | 99.99% (Gateway 层缓存 API Key) |
