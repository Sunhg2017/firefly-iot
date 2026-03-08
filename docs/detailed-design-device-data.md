# Firefly-IoT 设备数据上报模块 — 详细设计文档

> **版本**: v1.0.0  
> **日期**: 2026-02-27  
> **状态**: Draft  
> **关联**: [产品设计文档](./product-design.md) §9.3 时序数据分区策略

---

## 目录

1. [模块概述](#1-模块概述)
2. [核心概念与术语](#2-核心概念与术语)
3. [数据库设计](#3-数据库设计)
4. [枚举定义](#4-枚举定义)
5. [数据流架构](#5-数据流架构)
6. [API 接口设计](#6-api-接口设计)
7. [后端实现](#7-后端实现)
8. [前端交互设计](#8-前端交互设计)
9. [非功能性需求](#9-非功能性需求)

---

## 1. 模块概述

### 1.1 模块定位

设备数据上报模块负责 **设备遥测数据的接收、存储和查询**。支持设备属性上报、事件上报、时序数据查询、聚合统计，是 IoT 平台的核心数据通道。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| **数据写入** | 接收设备属性上报和事件上报，写入时序表 |
| **数据查询** | 按设备、属性、时间范围查询原始数据 |
| **聚合统计** | 按时间桶 (bucket) 聚合：平均值、最大值、最小值、计数 |
| **事件记录** | 设备事件的结构化存储和查询 |
| **最新值** | 查询设备某属性的最新上报值 |
| **数据权限** | 基于项目级数据权限过滤 |

### 1.3 数据流

```
设备 ──MQTT──► 协议接入层 ──Kafka──► 数据写入 Worker
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │TimescaleDB   │
                                  │device_telemetry│
                                  │device_events  │
                                  └──────────────┘
                                         │
                               REST API ◄─┘
                                  │
                                  ▼
                             前端数据展示
```

---

## 2. 核心概念与术语

| 术语 | 英文 | 说明 |
|------|------|------|
| **遥测数据** | Telemetry | 设备周期性上报的属性值（温度、湿度等） |
| **属性上报** | Property Report | 设备上报一个或多个属性的当前值 |
| **设备事件** | Device Event | 设备触发的离散事件（告警、状态变化等） |
| **时间桶** | Time Bucket | 聚合统计时的时间粒度（1min/5min/1hour/1day） |
| **消息类型** | Message Type | PROPERTY_REPORT / EVENT / SERVICE_CALL 等 |

---

## 3. 数据库设计

### 3.1 device_telemetry 表 (TimescaleDB 超表)

```sql
CREATE TABLE device_telemetry (
    ts              TIMESTAMPTZ NOT NULL,
    tenant_id       BIGINT NOT NULL,
    device_id       BIGINT NOT NULL,
    product_id      BIGINT NOT NULL,
    property        VARCHAR(128) NOT NULL,
    value_number    DOUBLE PRECISION,
    value_string    VARCHAR(1024),
    value_bool      BOOLEAN,
    raw_payload     JSONB
);

-- 转为 TimescaleDB 超表
SELECT create_hypertable('device_telemetry', 'ts',
    chunk_time_interval => INTERVAL '1 day');
```

### 3.2 device_events 表

```sql
CREATE TABLE device_events (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    device_id       BIGINT NOT NULL,
    product_id      BIGINT NOT NULL,
    event_type      VARCHAR(64) NOT NULL,
    event_name      VARCHAR(256),
    level           VARCHAR(16) NOT NULL DEFAULT 'INFO',
    payload         JSONB,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 4. 枚举定义

### 4.1 MessageType

```java
PROPERTY_REPORT("PROPERTY_REPORT"),
EVENT("EVENT"),
SERVICE_CALL("SERVICE_CALL"),
SERVICE_REPLY("SERVICE_REPLY")
```

### 4.2 EventLevel

```java
INFO("INFO"),
WARNING("WARNING"),
CRITICAL("CRITICAL")
```

---

## 5. 数据流架构

```
1. 设备通过 MQTT 发送消息到 topic: t_{tenantId}/{productKey}/{deviceName}/PROPERTY_REPORT
2. 协议接入层解析消息，发送到 Kafka topic: device.property.report
3. DeviceDataConsumer 消费 Kafka 消息
4. 解析 payload 中每个属性，写入 device_telemetry 表
5. 事件类型消息写入 device_events 表
6. REST API 提供数据查询和聚合
```

---

## 6. API 接口设计

### 6.1 数据写入（模拟/HTTP 上报）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/devices/{id}/telemetry` | `data:write` | 写入遥测数据（HTTP 模拟上报） |
| POST | `/api/v1/devices/{id}/events` | `data:write` | 写入设备事件 |

### 6.2 数据查询

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/device-data/query` | `data:read` | 查询原始遥测数据 |
| POST | `/api/v1/device-data/aggregate` | `data:read` | 聚合统计查询 |
| GET | `/api/v1/device-data/latest/{deviceId}` | `data:read` | 查询设备最新属性值 |
| POST | `/api/v1/device-events/list` | `data:read` | 分页查询设备事件 |

---

## 7. 后端实现

### 7.1 文件结构

```
firefly-system/src/main/java/.../system/
├── entity/
│   ├── DeviceTelemetry.java
│   └── DeviceEvent.java
├── dto/device_data/
│   ├── TelemetryWriteDTO.java
│   ├── TelemetryQueryDTO.java
│   ├── TelemetryAggregateDTO.java
│   ├── TelemetryDataVO.java
│   ├── TelemetryAggregateVO.java
│   ├── TelemetryLatestVO.java
│   ├── DeviceEventWriteDTO.java
│   ├── DeviceEventQueryDTO.java
│   └── DeviceEventVO.java
├── convert/
│   └── DeviceDataConvert.java
├── mapper/
│   ├── DeviceTelemetryMapper.java
│   └── DeviceEventMapper.java
├── service/
│   └── DeviceDataService.java
└── controller/
    └── DeviceDataController.java
```

---

## 8. 前端交互设计

### 8.1 数据查看页

- **设备选择**: 选择目标设备
- **属性筛选**: 选择要查看的属性
- **时间范围**: 快捷选择 (最近1h/6h/24h/7d) + 自定义
- **图表展示**: 折线图展示遥测趋势
- **数据表格**: 原始数据列表
- **事件列表**: 设备事件分页查询
- **路由**: `/device-data`

---

## 9. 非功能性需求

| 需求 | 指标 |
|------|------|
| **写入吞吐** | ≥ 50,000 点/秒 (3 节点) |
| **查询延迟** | 原始数据 P99 < 200ms，聚合查询 P99 < 500ms |
| **数据保留** | 默认 90 天，按租户配额配置 |
| **数据压缩** | TimescaleDB 原生压缩，90 天后自动压缩 |
