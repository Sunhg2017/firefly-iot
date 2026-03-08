# Firefly-IoT 设备管理模块 — 详细设计文档

> **版本**: v1.0.0  
> **日期**: 2026-02-27  
> **状态**: Draft  
> **关联**: [产品设计文档](./product-design.md) §7 设备管理核心

---

## 目录

1. [模块概述](#1-模块概述)
2. [核心概念与术语](#2-核心概念与术语)
3. [数据库设计](#3-数据库设计)
4. [枚举定义](#4-枚举定义)
5. [设备生命周期](#5-设备生命周期)
6. [API 接口设计](#6-api-接口设计)
7. [后端实现](#7-后端实现)
8. [前端交互设计](#8-前端交互设计)
9. [非功能性需求](#9-非功能性需求)

---

## 1. 模块概述

### 1.1 模块定位

设备管理模块是 Firefly-IoT 的 **核心业务模块**，负责设备的全生命周期管理，包括设备注册、认证、状态管理、标签、分组等。每个设备必须归属于一个产品（Product），由产品定义其物模型和接入协议。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| **设备注册** | 预注册（一机一密）或动态注册（一型一密）：管理员可预创建设备，也可由设备先按产品密钥动态换取 deviceSecret |
| **设备查询** | 分页查询、关键字搜索、按产品/状态/在线状态/标签筛选 |
| **设备详情** | 查看设备基本信息、在线状态、最近上线时间、标签、所属产品 |
| **设备编辑** | 修改设备名称（别名）、描述、标签 |
| **设备禁用/启用** | 禁用设备阻止其连接，启用恢复 |
| **设备删除** | 逻辑删除，保留 30 天后物理清理 |
| **设备标签** | Key-Value 标签，支持搜索和分组 |
| **批量导入** | CSV 批量导入设备（预注册） |
| **数据权限** | 基于用户角色的项目级数据权限过滤 |

### 1.3 模块依赖

```
┌──────────────────────────────────────────────┐
│                设备管理模块                     │
│                                               │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ 设备CRUD  │  │ 设备标签  │  │ 状态管理   │  │
│  └──────────┘  └──────────┘  └────────────┘  │
└──────────────────┬───────────────────────────┘
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ 产品管理  │ │ 项目管理  │ │ 租户管理  │
  └──────────┘ └──────────┘ └──────────┘
```

---

## 2. 核心概念与术语

| 术语 | 英文 | 说明 |
|------|------|------|
| **设备 (Device)** | Device | 产品的实例，唯一标识为 `{productKey}/{deviceName}` |
| **DeviceName** | Device Name | 设备在产品下的唯一标识，由用户指定或系统生成 |
| **DeviceSecret** | Device Secret | 设备认证密钥，一机一密直接使用；一型一密设备在动态注册成功后获得并落库 |
| **设备状态** | Device Status | 设备管理状态：INACTIVE / ACTIVE / DISABLED / DELETED |
| **在线状态** | Online Status | 设备连接状态：ONLINE / OFFLINE / UNKNOWN |
| **设备标签** | Device Tags | Key-Value 标签，存储为 JSONB |
| **设备别名** | Nickname | 设备的可读名称 |
| **网关子设备** | Sub-Device | 通过网关接入的子设备，gateway_id 指向网关设备 |

---

## 3. 数据库设计

### 3.1 devices 表

```sql
CREATE TABLE devices (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
    product_id          BIGINT NOT NULL REFERENCES products(id),
    project_id          BIGINT REFERENCES projects(id),
    device_name         VARCHAR(64) NOT NULL,
    device_secret       VARCHAR(64) NOT NULL,
    nickname            VARCHAR(256),
    description         TEXT,
    status              VARCHAR(16) NOT NULL DEFAULT 'INACTIVE',
    online_status       VARCHAR(16) NOT NULL DEFAULT 'OFFLINE',
    firmware_version    VARCHAR(64),
    ip_address          VARCHAR(45),
    tags                JSONB DEFAULT '{}',
    gateway_id          BIGINT REFERENCES devices(id),
    last_online_at      TIMESTAMPTZ,
    last_offline_at     TIMESTAMPTZ,
    activated_at        TIMESTAMPTZ,
    created_by          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT uk_device_product_name UNIQUE (product_id, device_name)
);
CREATE INDEX idx_devices_tenant ON devices(tenant_id);
CREATE INDEX idx_devices_product ON devices(product_id);
CREATE INDEX idx_devices_project ON devices(project_id);
CREATE INDEX idx_devices_status ON devices(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_devices_online ON devices(tenant_id, online_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_devices_gateway ON devices(gateway_id);
CREATE INDEX idx_devices_tags ON devices USING gin(tags);
```

### 3.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `device_name` | VARCHAR(64) | 产品内唯一标识，如 `sensor_001` |
| `device_secret` | VARCHAR(64) | 设备认证密钥，创建时生成 |
| `nickname` | VARCHAR(256) | 可读名称/别名 |
| `status` | VARCHAR(16) | 管理状态：INACTIVE / ACTIVE / DISABLED |
| `online_status` | VARCHAR(16) | 在线状态：ONLINE / OFFLINE / UNKNOWN |
| `firmware_version` | VARCHAR(64) | 当前固件版本 |
| `ip_address` | VARCHAR(45) | 最近连接 IP |
| `tags` | JSONB | Key-Value 标签，如 `{"region":"east","floor":"3"}` |
| `gateway_id` | BIGINT | 网关设备 ID（子设备时有值） |
| `deleted_at` | TIMESTAMPTZ | 逻辑删除时间 |

---

## 4. 枚举定义

### 4.1 DeviceStatus (管理状态)

```java
INACTIVE("INACTIVE"),   // 未激活（已注册，未上线）
ACTIVE("ACTIVE"),       // 已激活（已至少上线过一次）
DISABLED("DISABLED")    // 已禁用（管理员手动禁用）
```

### 4.2 OnlineStatus (在线状态)

```java
ONLINE("ONLINE"),       // 在线
OFFLINE("OFFLINE"),     // 离线
UNKNOWN("UNKNOWN")      // 未知（从未连接过）
```

---

## 5. 设备生命周期

```
创建(预注册) → INACTIVE/UNKNOWN
    │
    ▼ 首次上线
ACTIVE/ONLINE
    │
    ├── 心跳超时/主动断开 → ACTIVE/OFFLINE
    │
    ├── 管理员禁用 → DISABLED/OFFLINE
    │   └── 管理员启用 → ACTIVE/OFFLINE
    │
    └── 管理员删除 → 逻辑删除 (deleted_at)
```

---

## 6. API 接口设计

### 6.1 接口总览

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/devices` | `device:create` | 创建设备（预注册） |
| POST | `/api/v1/devices/list` | `device:read` | 分页查询 |
| GET | `/api/v1/devices/{id}` | `device:read` | 查看详情 |
| PUT | `/api/v1/devices/{id}` | `device:update` | 更新设备信息 |
| PUT | `/api/v1/devices/{id}/enable` | `device:update` | 启用设备 |
| PUT | `/api/v1/devices/{id}/disable` | `device:update` | 禁用设备 |
| DELETE | `/api/v1/devices/{id}` | `device:delete` | 删除设备（逻辑删除） |
| GET | `/api/v1/devices/{id}/secret` | `device:read` | 查看设备密钥 |

### 6.2 创建设备

**Request**:
```json
{
  "productId": 1,
  "projectId": 1,
  "deviceName": "sensor_001",
  "nickname": "3号楼温湿度传感器",
  "description": "安装于3号楼2层",
  "tags": { "region": "east", "floor": "3" }
}
```

**Response**:
```json
{
  "code": 0,
  "data": {
    "id": 1,
    "productId": 1,
    "deviceName": "sensor_001",
    "deviceSecret": "ds_...",
    "nickname": "3号楼温湿度传感器",
    "status": "INACTIVE",
    "onlineStatus": "UNKNOWN",
    "tags": { "region": "east", "floor": "3" },
    "createdAt": "2026-02-27T10:00:00"
  }
}
```

### 6.3 分页查询

**Request** (POST `/api/v1/devices/list`):
```json
{
  "pageNum": 1,
  "pageSize": 20,
  "keyword": "sensor",
  "productId": 1,
  "status": "ACTIVE",
  "onlineStatus": "ONLINE",
  "projectId": 1
}
```

---

## 7. 后端实现

### 7.1 文件结构

```
firefly-system/src/main/java/.../system/
├── entity/
│   └── Device.java
├── dto/device/
│   ├── DeviceVO.java
│   ├── DeviceCreateDTO.java
│   ├── DeviceUpdateDTO.java
│   └── DeviceQueryDTO.java
├── convert/
│   └── DeviceConvert.java
├── mapper/
│   └── DeviceMapper.java
├── service/
│   └── DeviceService.java
└── controller/
    └── DeviceController.java

firefly-common/src/main/java/.../common/enums/
├── DeviceStatus.java
└── OnlineStatus.java
```

### 7.2 关键设计

- **DeviceSecret 生成**: `ds_` + 32 位安全随机字符
- **唯一性约束**: `(product_id, device_name)` 联合唯一
- **逻辑删除**: `deleted_at` 字段，查询时过滤 `deleted_at IS NULL`
- **标签存储**: JSONB，作为 `String` 类型存储
- **数据范围**: `listDevices()` 标注 `@DataScope`
- **设备创建时**: 更新产品的 `device_count` 字段 (+1)
- **设备删除时**: 更新产品的 `device_count` 字段 (-1)

---

## 8. 前端交互设计

### 8.1 设备列表页

- **搜索栏**: 关键字搜索 + 产品筛选 + 状态筛选 + 在线状态筛选
- **表格列**: 设备名称、别名、ProductKey、状态、在线状态、固件版本、IP、最近上线、操作
- **操作按钮**: 新建设备、编辑、启用/禁用、删除
- **状态指示**: 在线绿色圆点、离线灰色、未知黄色
- **路由**: `/device`

---

## 9. 非功能性需求

| 需求 | 指标 |
|------|------|
| **查询性能** | 分页查询 P99 < 200ms（10万设备规模） |
| **在线状态更新** | 通过 `firefly-connector` 内置 MQTT 生命周期事件异步更新，不在管理 API 中处理 |
| **标签搜索** | PostgreSQL GIN 索引，支持 JSONB 包含查询 |
| **配额限制** | 每租户设备数上限由 `tenant_quotas.max_devices` 控制 |
| **逻辑删除** | 删除后 30 天定时任务物理清理 |
