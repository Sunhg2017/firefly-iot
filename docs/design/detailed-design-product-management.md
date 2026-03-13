# Firefly-IoT 产品管理模块 — 详细设计文档

> **版本**: v1.0.0  
> **日期**: 2026-02-27  
> **状态**: Draft  
> **关联**: [产品设计文档](./product-design.md) §7 设备管理核心、§15.1 产品管理

---

## 目录

1. [模块概述](#1-模块概述)
2. [核心概念与术语](#2-核心概念与术语)
3. [数据库设计](#3-数据库设计)
4. [枚举定义](#4-枚举定义)
5. [API 接口设计](#5-api-接口设计)
6. [后端实现](#6-后端实现)
7. [前端交互设计](#7-前端交互设计)
8. [物模型设计](#8-物模型设计)
9. [非功能性需求](#9-非功能性需求)

---

## 1. 模块概述

### 1.1 模块定位

产品管理模块是 Firefly-IoT 的 **设备接入核心**，定义了同一类设备的统一抽象（物模型、接入协议、Topic 规则等）。每个设备必须归属于一个产品，产品决定了设备的能力描述和通信方式。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| **产品 CRUD** | 创建、查看、编辑、删除产品；支持分页查询与关键字搜索 |
| **ProductKey 生成** | 创建时自动生成全局唯一的 productKey，作为设备接入标识 |
| **物模型定义** | 以 JSON 格式描述设备属性（Properties）、事件（Events）、服务（Services） |
| **协议配置** | 指定产品使用的接入协议（MQTT / CoAP / HTTP / LwM2M / 自定义） |
| **产品发布** | 产品从开发中→已发布状态流转，发布后物模型锁定（仅允许新增） |
| **产品分类** | 按设备类型分类（传感器、网关、控制器、摄像头等） |
| **数据范围** | 基于用户角色的项目级数据权限过滤 |

### 1.3 模块依赖

```
┌──────────────────────────────────────────────────┐
│                   产品管理模块                      │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ 产品CRUD  │  │ 物模型    │  │ ProductKey   │    │
│  └──────────┘  └──────────┘  └──────────────┘    │
└──────────────────────┬───────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │ 租户管理  │  │ 项目管理  │  │ 设备管理  │
   │ (tenant) │  │ (project) │  │ (device) │
   └──────────┘  └──────────┘  └──────────┘
```

---

## 2. 核心概念与术语

| 术语 | 英文 | 说明 |
|------|------|------|
| **产品 (Product)** | Product | 同一类设备的抽象定义，包含物模型、接入协议等 |
| **ProductKey** | Product Key | 产品的全局唯一标识，格式 `pk_` + 16位随机字符串 |
| **物模型 (Thing Model)** | Thing Model | 设备能力的 JSON 描述：属性、事件、服务 |
| **产品分类** | Category | 设备类型分类：SENSOR / GATEWAY / CONTROLLER / CAMERA / OTHER |
| **接入协议** | Protocol | 设备通信协议：MQTT / COAP / HTTP / LWM2M / CUSTOM |
| **产品状态** | Status | 产品生命周期状态：DEVELOPMENT / PUBLISHED / DEPRECATED |
| **产品密钥** | Product Secret | 一型一密场景下的产品级密钥，用于动态设备注册 |

---

## 3. 数据库设计

### 3.1 products 表

```sql
CREATE TABLE products (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
    project_id          BIGINT REFERENCES projects(id),
    product_key         VARCHAR(32) NOT NULL UNIQUE,
    product_secret      VARCHAR(64),
    name                VARCHAR(256) NOT NULL,
    description         TEXT,
    category            VARCHAR(32) NOT NULL DEFAULT 'OTHER',
    protocol            VARCHAR(32) NOT NULL DEFAULT 'MQTT',
    thing_model         JSONB DEFAULT '{"properties":[],"events":[],"services":[]}',
    node_type           VARCHAR(16) NOT NULL DEFAULT 'DEVICE',
    data_format         VARCHAR(16) NOT NULL DEFAULT 'JSON',
    status              VARCHAR(16) NOT NULL DEFAULT 'DEVELOPMENT',
    device_count        INT NOT NULL DEFAULT 0,
    created_by          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_project ON products(project_id);
CREATE INDEX idx_products_key ON products(product_key);
CREATE INDEX idx_products_category ON products(tenant_id, category);
```

### 3.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `product_key` | VARCHAR(32) | 全局唯一标识，格式 `pk_` + 16位随机字符 |
| `product_secret` | VARCHAR(64) | 一型一密场景的产品密钥 |
| `category` | VARCHAR(32) | 产品分类：SENSOR / GATEWAY / CONTROLLER / CAMERA / OTHER |
| `protocol` | VARCHAR(32) | 接入协议：MQTT / COAP / HTTP / LWM2M / CUSTOM |
| `thing_model` | JSONB | 物模型定义 JSON |
| `node_type` | VARCHAR(16) | 节点类型：DEVICE (直连设备) / GATEWAY (网关) |
| `data_format` | VARCHAR(16) | 数据格式：JSON / CUSTOM (自定义/透传) |
| `status` | VARCHAR(16) | 产品状态：DEVELOPMENT / PUBLISHED / DEPRECATED |
| `device_count` | INT | 该产品下的设备数量（缓存字段，异步更新） |

---

## 4. 枚举定义

### 4.1 ProductStatus

```java
DEVELOPMENT("DEVELOPMENT"),   // 开发中
PUBLISHED("PUBLISHED"),       // 已发布
DEPRECATED("DEPRECATED")      // 已废弃
```

### 4.2 ProtocolType

```java
MQTT("MQTT"),
COAP("COAP"),
HTTP("HTTP"),
LWM2M("LWM2M"),
CUSTOM("CUSTOM")
```

### 4.3 ProductCategory

```java
SENSOR("SENSOR"),           // 传感器
GATEWAY("GATEWAY"),         // 网关
CONTROLLER("CONTROLLER"),   // 控制器
CAMERA("CAMERA"),           // 摄像头
OTHER("OTHER")              // 其他
```

### 4.4 NodeType

```java
DEVICE("DEVICE"),     // 直连设备
GATEWAY("GATEWAY")    // 网关设备
```

### 4.5 DataFormat

```java
JSON("JSON"),       // JSON 格式
CUSTOM("CUSTOM")    // 自定义/透传
```

---

## 5. API 接口设计

### 5.1 接口总览

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/products` | `product:create` | 创建产品 |
| POST | `/api/v1/products/list` | `product:read` | 分页查询 |
| GET | `/api/v1/products/{id}` | `product:read` | 查看详情 |
| PUT | `/api/v1/products/{id}` | `product:update` | 更新产品 |
| PUT | `/api/v1/products/{id}/publish` | `product:publish` | 发布产品 |
| DELETE | `/api/v1/products/{id}` | `product:delete` | 删除产品 |
| PUT | `/api/v1/products/{id}/thing-model` | `product:update` | 更新物模型 |
| GET | `/api/v1/products/{id}/thing-model` | `product:read` | 查看物模型 |

### 5.2 创建产品

**Request**:
```json
{
  "name": "智能电表",
  "description": "三相智能电表",
  "projectId": 1,
  "category": "SENSOR",
  "protocol": "MQTT",
  "nodeType": "DEVICE",
  "dataFormat": "JSON"
}
```

**Response**:
```json
{
  "code": 0,
  "data": {
    "id": 1,
    "productKey": "pk_a1b2c3d4e5f6g7h8",
    "productSecret": "ps_...",
    "name": "智能电表",
    "category": "SENSOR",
    "protocol": "MQTT",
    "nodeType": "DEVICE",
    "dataFormat": "JSON",
    "status": "DEVELOPMENT",
    "deviceCount": 0,
    "createdAt": "2026-02-27T10:00:00"
  }
}
```

### 5.3 分页查询

**Request** (POST `/api/v1/products/list`):
```json
{
  "pageNum": 1,
  "pageSize": 20,
  "keyword": "电表",
  "category": "SENSOR",
  "protocol": "MQTT",
  "status": "DEVELOPMENT"
}
```

### 5.4 更新物模型

**Request** (PUT `/api/v1/products/{id}/thing-model`):
```json
{
  "properties": [
    {
      "identifier": "temperature",
      "name": "温度",
      "dataType": { "type": "float", "min": -40, "max": 125, "unit": "°C" },
      "accessMode": "r",
      "required": true
    }
  ],
  "events": [],
  "services": []
}
```

---

## 6. 后端实现

### 6.1 文件结构

```
firefly-system/src/main/java/.../system/
├── entity/
│   └── Product.java
├── dto/product/
│   ├── ProductVO.java
│   ├── ProductCreateDTO.java
│   ├── ProductUpdateDTO.java
│   └── ProductQueryDTO.java
├── convert/
│   └── ProductConvert.java
├── mapper/
│   └── ProductMapper.java
├── service/
│   └── ProductService.java
└── controller/
    └── ProductController.java

firefly-common/src/main/java/.../common/enums/
├── ProductStatus.java
├── ProtocolType.java
├── ProductCategory.java
├── NodeType.java
└── DataFormat.java
```

### 6.2 关键设计

- **ProductKey 生成**: `pk_` + 16位安全随机字符（a-z0-9），全局唯一
- **ProductSecret 生成**: `ps_` + 32位安全随机字符
- **物模型存储**: JSONB 字段，以 `String` 形式存储（物模型结构较复杂，暂不做类型映射）
- **数据范围**: `listProducts()` 方法标注 `@DataScope`，自动过滤项目级数据
- **发布流程**: 产品状态 DEVELOPMENT → PUBLISHED，发布后不允许删除
- **删除限制**: 产品下有设备时不允许删除

---

## 7. 前端交互设计

### 7.1 产品列表页

- **搜索栏**: 关键字搜索 + 分类筛选 + 协议筛选 + 状态筛选
- **表格列**: 产品名称、ProductKey、分类、协议、节点类型、状态、设备数、创建时间、操作
- **操作按钮**: 新建产品、编辑、发布、删除
- **路由**: `/product`

### 7.2 新建/编辑弹窗

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|

---

## 10. 2026-03-13 产品页面信息层级优化

### 10.1 背景

- 产品列表页原有卡片同时在图片区、标签区和明细区重复展示分类、协议、认证方式、设备数等信息。
- 单卡信息层级过深，用户需要在多块区域来回比对，页面容易显得臃肿。
- 页头描述直接堆砌统计数字，与卡片浏览场景不够匹配。

### 10.2 调整方案

- 页头描述改为页面用途说明，不再重复承载统计明细。
- 在筛选区前增加“页面总览”卡片，集中展示：
  - 当前页产品数
  - 已发布产品数
  - 开发中产品数
  - 当前页关联设备总量
  - 当前启用的筛选条件
- 产品卡片重构为四层结构：
  - 封面区只保留状态角标和分类图标，减少视觉噪音
  - 标题区展示产品名称、ProductKey、可选型号
  - 摘要区仅保留分类、协议、认证方式三个身份标签
  - 指标区仅保留节点类型、数据格式、设备数量三项关键指标
- 卡片操作区从大按钮改为轻量链接式操作，降低底部视觉压力。

### 10.3 设计结果

- 产品卡片不再重复展示同一组字段，浏览路径更短。
- 页面总览与筛选条件分层清晰，适合先看全局、再筛选、再浏览卡片。
- 卡片更适合在中后台目录页中批量浏览，表格视图仍保留批量管理能力。
| 产品名称 | Input | ✅ | |
| 描述 | TextArea | ❌ | |
| 所属项目 | Select | ❌ | 项目列表下拉 |
| 产品分类 | Select | ✅ | SENSOR/GATEWAY/CONTROLLER/CAMERA/OTHER |
| 接入协议 | Select | ✅ | MQTT/COAP/HTTP/LWM2M/CUSTOM |
| 节点类型 | Select | ✅ | DEVICE/GATEWAY |
| 数据格式 | Select | ✅ | JSON/CUSTOM |

---

## 8. 物模型设计

### 8.1 结构定义

```json
{
  "properties": [
    {
      "identifier": "string",
      "name": "string",
      "dataType": {
        "type": "int|float|double|string|bool|enum|date|array|struct",
        "specs": {}
      },
      "accessMode": "r|rw",
      "required": true
    }
  ],
  "events": [
    {
      "identifier": "string",
      "name": "string",
      "type": "info|alert|error",
      "outputData": []
    }
  ],
  "services": [
    {
      "identifier": "string",
      "name": "string",
      "callType": "sync|async",
      "inputData": [],
      "outputData": []
    }
  ]
}
```

### 8.2 物模型管理规则

- 产品处于 DEVELOPMENT 状态时，物模型可自由编辑
- 产品发布后（PUBLISHED），物模型仅允许 **新增** 属性/事件/服务，不允许删除或修改已有定义
- 物模型变更记录在审计日志中

---

## 9. 非功能性需求

| 需求 | 指标 |
|------|------|
| **查询性能** | 分页查询 P99 < 100ms |
| **ProductKey 唯一性** | 数据库 UNIQUE 约束 + 应用层重试 |
| **缓存** | 产品信息 L1 本地缓存 (5min) + L2 Redis 缓存 (30min) |
| **配额** | 每租户最多创建 1000 个产品 |
