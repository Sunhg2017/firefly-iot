# Firefly-IoT OTA 升级模块 — 详细设计文档

> **版本**: v1.0.0  
> **日期**: 2026-02-27  
> **状态**: Draft  
> **关联**: [产品设计文档](./product-design.md) §7.6 OTA 升级

---

## 目录

1. [模块概述](#1-模块概述)
2. [核心概念与术语](#2-核心概念与术语)
3. [数据库设计](#3-数据库设计)
4. [枚举定义](#4-枚举定义)
5. [OTA 升级流程](#5-ota-升级流程)
6. [API 接口设计](#6-api-接口设计)
7. [后端实现](#7-后端实现)
8. [前端交互设计](#8-前端交互设计)
9. [非功能性需求](#9-非功能性需求)

---

## 1. 模块概述

### 1.1 模块定位

OTA (Over-The-Air) 升级模块负责 **固件版本管理** 和 **升级任务管理**。支持固件上传、版本管理、升级任务创建（全量/灰度）、升级进度跟踪和回滚。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| **固件管理** | 上传、查看、删除固件版本 |
| **升级任务** | 创建升级任务，指定目标产品、目标版本、升级策略 |
| **灰度发布** | 按比例或指定设备列表灰度升级 |
| **进度跟踪** | 每台设备的升级状态实时跟踪 |
| **升级取消** | 取消进行中的升级任务 |
| **数据权限** | 基于项目级数据权限过滤 |

### 1.3 模块依赖

```
┌────────────────────────────────────┐
│          OTA 升级模块               │
│                                     │
│  ┌──────────┐  ┌──────────────┐    │
│  │ 固件管理  │  │ 升级任务管理 │    │
│  └──────────┘  └──────────────┘    │
└──────────┬─────────────────────────┘
           │
   ┌───────┼───────┐
   ▼       ▼       ▼
┌────┐ ┌────┐ ┌──────┐
│产品│ │设备│ │MinIO │
└────┘ └────┘ └──────┘
```

---

## 2. 核心概念与术语

| 术语 | 英文 | 说明 |
|------|------|------|
| **固件** | Firmware | 设备运行的软件包，包含版本号、文件 URL、校验值 |
| **固件版本** | Firmware Version | 语义化版本号，如 `1.2.0` |
| **升级任务** | OTA Task | 一次升级操作，关联产品、源版本、目标版本 |
| **任务设备** | Task Device | 升级任务中每台设备的升级状态记录 |
| **灰度比例** | Gray Ratio | 灰度升级时的设备百分比 |

---

## 3. 数据库设计

### 3.1 firmwares 表

```sql
CREATE TABLE firmwares (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
    product_id      BIGINT NOT NULL REFERENCES products(id),
    version         VARCHAR(64) NOT NULL,
    display_name    VARCHAR(256),
    description     TEXT,
    file_url        VARCHAR(1024) NOT NULL,
    file_size       BIGINT NOT NULL DEFAULT 0,
    md5_checksum    VARCHAR(64),
    status          VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_firmware_product_version UNIQUE (product_id, version)
);
```

### 3.2 ota_tasks 表

```sql
CREATE TABLE ota_tasks (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
    product_id      BIGINT NOT NULL REFERENCES products(id),
    firmware_id     BIGINT NOT NULL REFERENCES firmwares(id),
    name            VARCHAR(256) NOT NULL,
    description     TEXT,
    task_type       VARCHAR(16) NOT NULL DEFAULT 'FULL',
    src_version     VARCHAR(64),
    dest_version    VARCHAR(64) NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    total_count     INT NOT NULL DEFAULT 0,
    success_count   INT NOT NULL DEFAULT 0,
    failure_count   INT NOT NULL DEFAULT 0,
    gray_ratio      INT,
    created_by      BIGINT,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.3 ota_task_devices 表

```sql
CREATE TABLE ota_task_devices (
    id              BIGSERIAL PRIMARY KEY,
    task_id         BIGINT NOT NULL REFERENCES ota_tasks(id) ON DELETE CASCADE,
    device_id       BIGINT NOT NULL REFERENCES devices(id),
    status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    progress        INT NOT NULL DEFAULT 0,
    error_message   TEXT,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 4. 枚举定义

### 4.1 FirmwareStatus

```java
DRAFT("DRAFT"),         // 草稿
VERIFIED("VERIFIED"),   // 已验证
RELEASED("RELEASED")    // 已发布
```

### 4.2 OtaTaskStatus

```java
PENDING("PENDING"),         // 待执行
IN_PROGRESS("IN_PROGRESS"), // 执行中
COMPLETED("COMPLETED"),     // 已完成
CANCELLED("CANCELLED")      // 已取消
```

### 4.3 OtaTaskType

```java
FULL("FULL"),       // 全量升级
GRAY("GRAY")        // 灰度升级
```

### 4.4 OtaDeviceStatus

```java
PENDING("PENDING"),         // 待升级
DOWNLOADING("DOWNLOADING"), // 下载中
UPGRADING("UPGRADING"),     // 升级中
SUCCESS("SUCCESS"),         // 成功
FAILURE("FAILURE"),         // 失败
CANCELLED("CANCELLED")      // 已取消
```

---

## 5. OTA 升级流程

```
1. 上传固件 → DRAFT
2. 验证固件 → VERIFIED
3. 发布固件 → RELEASED
4. 创建升级任务 (PENDING)
5. 启动任务 (IN_PROGRESS) → 逐台设备推送
   └─ 设备: PENDING → DOWNLOADING → UPGRADING → SUCCESS/FAILURE
6. 任务完成 (COMPLETED) / 取消 (CANCELLED)
```

---

## 6. API 接口设计

### 6.1 固件管理

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/firmwares` | `ota:upload` | 创建固件记录 |
| POST | `/api/v1/firmwares/list` | `ota:read` | 分页查询 |
| GET | `/api/v1/firmwares/{id}` | `ota:read` | 查看详情 |
| PUT | `/api/v1/firmwares/{id}` | `ota:upload` | 更新固件信息 |
| PUT | `/api/v1/firmwares/{id}/verify` | `ota:upload` | 验证固件 |
| PUT | `/api/v1/firmwares/{id}/release` | `ota:upload` | 发布固件 |
| DELETE | `/api/v1/firmwares/{id}` | `ota:delete` | 删除固件 |

### 6.2 升级任务

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/ota-tasks` | `ota:deploy` | 创建升级任务 |
| POST | `/api/v1/ota-tasks/list` | `ota:read` | 分页查询 |
| GET | `/api/v1/ota-tasks/{id}` | `ota:read` | 查看任务详情（含设备进度） |
| PUT | `/api/v1/ota-tasks/{id}/cancel` | `ota:deploy` | 取消任务 |

---

## 7. 后端实现

### 7.1 文件结构

```
firefly-system/src/main/java/.../system/
├── entity/
│   ├── Firmware.java
│   ├── OtaTask.java
│   └── OtaTaskDevice.java
├── dto/ota/
│   ├── FirmwareVO.java
│   ├── FirmwareCreateDTO.java
│   ├── FirmwareUpdateDTO.java
│   ├── FirmwareQueryDTO.java
│   ├── OtaTaskVO.java
│   ├── OtaTaskCreateDTO.java
│   ├── OtaTaskQueryDTO.java
│   └── OtaTaskDeviceVO.java
├── convert/
│   └── OtaConvert.java
├── mapper/
│   ├── FirmwareMapper.java
│   ├── OtaTaskMapper.java
│   └── OtaTaskDeviceMapper.java
├── service/
│   └── OtaService.java
└── controller/
    └── OtaController.java
```

---

## 8. 前端交互设计

### 8.1 OTA 页面

- **Tab 切换**: 固件管理 / 升级任务
- **固件表格**: 产品、版本号、状态、文件大小、操作（验证/发布/删除）
- **任务表格**: 任务名称、目标版本、类型、总数/成功/失败、状态、操作（查看/取消）
- **路由**: `/ota`

---

## 9. 非功能性需求

| 需求 | 指标 |
|------|------|
| **固件存储** | MinIO (S3 兼容)，每租户配额由 `tenant_quotas.ota_storage` 控制 |
| **并发升级** | 单任务最大 10,000 台设备并行 |
| **超时** | 单设备升级超时 30 分钟自动标记失败 |
