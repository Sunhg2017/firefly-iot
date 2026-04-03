# Firefly-IoT 分布式物联网设备管理平台 — 产品设计文档

> **版本**: v1.1.0  
> **日期**: 2026-02-25  
> **状态**: Draft  

---

## 目录

1. [产品愿景与目标](#1-产品愿景与目标)
2. [核心设计原则](#2-核心设计原则)
3. [系统总体架构](#3-系统总体架构)
4. [多租户体系设计](#4-多租户体系设计)
5. [跨租户设备数据共享](#5-跨租户设备数据共享)
6. [设备接入层设计](#6-设备接入层设计)
7. [设备管理核心](#7-设备管理核心)
8. [规则引擎与数据流](#8-规则引擎与数据流)
9. [数据存储设计](#9-数据存储设计)
10. [快速部署方案](#10-快速部署方案)
11. [百万级设备支撑架构](#11-百万级设备支撑架构)
12. [安全体系](#12-安全体系)
13. [可观测性](#13-可观测性)
14. [开放能力与集成](#14-开放能力与集成)
15. [产品功能模块清单](#15-产品功能模块清单)
16. [技术选型总览](#16-技术选型总览)
17. [项目里程碑](#17-项目里程碑)
18. [附录](#18-附录)

---

## 1. 产品愿景与目标

### 1.1 愿景

打造一款**云原生、高可用、可水平扩展**的分布式物联网设备管理平台（代号 **Firefly-IoT**），面向企业级 IoT 场景，提供从设备接入、管理、数据处理到业务集成的全链路能力。

### 1.2 核心目标

| 目标 | 指标 |
|------|------|
| **海量设备** | 单集群支撑 **100 万+** 设备同时在线 |
| **多协议接入** | MQTT 3.1.1 / 5.0、CoAP、HTTP/HTTPS、WebSocket、LwM2M、GB/T 28181、RTSP/RTMP、Modbus（网关桥接）、TCP/UDP 自定义协议 |
| **多租户隔离** | 数据、网络、资源三级隔离，支持 SaaS / 私有化混合交付 |
| **快速部署** | 单节点 Docker 一键启动 ≤ 5 min；K8s 集群 Helm 部署 ≤ 15 min |
| **高可用** | 核心链路 99.99% 可用，RPO=0，RTO ≤ 30 s |
| **低延迟** | 设备消息端到端 P99 延迟 ≤ 200 ms |

### 1.3 目标用户

- **IoT 平台运营商**：需要多租户 SaaS 能力
- **企业 IT 部门**：需要私有化部署、快速上线
- **系统集成商**：需要灵活 API 与可扩展的协议支持
- **设备制造商**：需要设备全生命周期管理
- **终端用户**：通过 APP / 小程序进行设备控制、数据查看、视频监控

---

## 2. 核心设计原则

| 原则 | 说明 |
|------|------|
| **Cloud-Native** | 容器化交付，Kubernetes 编排，Operator 模式管理有状态组件 |
| **Protocol-Agnostic** | 协议适配器插件化，新协议零侵入接入 |
| **Tenant-First** | 租户维度贯穿全链路（接入→存储→计算→展示） |
| **Event-Driven** | 基于事件总线解耦各子系统，异步优先 |
| **Extensible** | 插件 / Webhook / Serverless Function 三级扩展 |
| **Secure by Default** | TLS 默认启用，最小权限，端到端加密可选 |

---

## 3. 系统总体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          客户端 & 管理端                                │
│  Web Console │ Mobile App (iOS/Android) │ 小程序 │ Open API │ CLI  │
└──────────┬──────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       API Gateway / BFF Layer                           │
│         认证鉴权 · 限流 · 路由 · 多租户上下文注入                          │
└──────────┬──────────────────────────────────────────────────────────────┘
           │
     ┌─────┴──────────────────────────────────────────────────┐
     │                  微服务集群 (K8s)                       │
     │                                                        │
     │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
     │  │ 租户服务  │ │ 设备管理 │ │ 产品管理 │ │ OTA 服务 │  │
     │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
     │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
     │  │ 规则引擎 │ │ 告警服务 │ │ 用户权限 │ │ 审计日志 │  │
     │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
     └─────┬──────────────────────────────────────────────────┘
           │
     ┌─────┴──────────────────────────────────────────────────┐
     │              消息 & 事件总线                             │
     │    Apache Kafka (KRaft, per-tenant topic)               │
     └─────┬──────────────────────────────────────────────────┘
           │
     ┌─────┴──────────────────────────────────────────────────┐
     │              设备接入层 (Protocol Gateway)              │
     │                                                        │
     │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐          │
     │  │ MQTT   │ │ CoAP   │ │ HTTP   │ │ LwM2M  │          │
     │  │ Broker │ │ Server │ │ Server │ │ Server │          │
     │  └────────┘ └────────┘ └────────┘ └────────┘          │
     │  ┌────────────┐ ┌───────────────────────────────┐  │
     │  │ Video      │ │ Protocol Adapter Plugin SPI    │  │
     │  │ Gateway    │ │ (Modbus / Custom TCP/UDP ...) │  │
     │  │ (GB28181/  │ └───────────────────────────────┘  │
     │  │  RTSP/RTMP)│                                    │
     │  └────────────┘                                    │
     └─────┬──────────────────────────────────────────────────┘
           │
     ┌─────┴──────────────────────────────────────────────────┐
     │              数据存储层                                  │
     │                                                        │
     │  ┌───────────┐ ┌───────────┐ ┌───────────┐            │
     │  │ PostgreSQL│ │ TimescaleDB│ │  Redis    │            │
     │  │ (元数据)  │ │ (时序数据) │ │ (缓存/会话)│            │
     │  └───────────┘ └───────────┘ └───────────┘            │
     │  ┌───────────┐ ┌───────────┐                           │
     │  │ MinIO/S3  │ │ Elasticsearch│                        │
     │  │ (固件/文件)│ │ (日志/搜索)  │                        │
     │  └───────────┘ └───────────┘                           │
     └────────────────────────────────────────────────────────┘
```

### 3.1 分层说明

| 层级 | 职责 | 横向扩展方式 |
|------|------|-------------|
| **客户端层** | 用户交互、设备模拟 | CDN / 静态资源分发 |
| **网关层** | 认证、限流、路由、租户上下文 | 无状态水平扩展 |
| **业务服务层** | 领域逻辑、CQRS | Pod 自动扩缩容 (HPA) |
| **消息总线** | 异步解耦、事件溯源 | Kafka 分区横向扩展 |
| **接入层** | 协议终结、消息标准化 | 按协议独立扩展 |
| **存储层** | 持久化 | 分库分表 / 集群模式 |

---

## 4. 多租户体系设计

### 4.1 租户模型

```
Platform (Super Admin)
  └── Tenant (Organization)
        ├── Project (可选的逻辑分组)
        │     ├── Product
        │     │     └── Device
        │     ├── Rule
        │     └── Dashboard
        ├── User & Role
        └── Billing / Quota
```

### 4.2 隔离策略

| 维度 | 隔离级别 | 实现方式 |
|------|---------|---------|
| **数据隔离** | 逻辑隔离（共享库）+ 可选物理隔离（独立库） | `tenant_id` 列 + Row-Level Security (RLS)；大客户可配置独立 PostgreSQL 实例 |
| **消息隔离** | Topic 级别 | Kafka topic 前缀 `t_{tenantId}_`；ACL 限制跨租户访问 |
| **接入隔离** | 认证域隔离 | 每租户独立 ClientID 命名空间 + 独立 TLS 证书（可选） |
| **计算隔离** | 资源配额 | 规则引擎 per-tenant 线程池 / 速率限制；K8s ResourceQuota |
| **网络隔离** | Namespace 级别 | 大客户可部署在独立 K8s Namespace，NetworkPolicy 隔离 |

### 4.3 租户生命周期

```
创建 → 初始化(资源分配/数据库Schema) → 活跃 → 暂停(超额/欠费) → 恢复 → 注销(数据归档/销毁)
```

### 4.4 配额与计量

| 配额项 | 免费版 | 标准版 | 企业版 |
|--------|-------|-------|-------|
| 设备数 | 100 | 10,000 | 不限 |
| 消息速率 | 100 msg/s | 10,000 msg/s | 自定义 |
| 规则数 | 10 | 100 | 不限 |
| 数据保留 | 7 天 | 90 天 | 自定义 |
| OTA 存储 | 1 GB | 50 GB | 不限 |
| API 调用 | 10,000/天 | 1,000,000/天 | 不限 |

---

## 5. 跨租户设备数据共享

### 5.1 设计背景

在多租户 IoT 平台中，数据隔离是基本安全要求，但真实业务场景中常需要**受控的跨租户数据共享**：
- **产业链协作**：上游设备厂商将运行数据共享给下游运维服务商
- **集团多子公司**：母公司需要汇总查看所有子公司租户的设备数据
- **第三方数据服务**：设备数据脱敏后共享给数据分析/AI 服务租户
- **设备托管**：设备归属租户 A，运营管理委托给租户 B

### 5.2 共享模型

```
┌──────────────────────────────────────────────────────────────────┐
│                     数据共享控制平面                               │
│                                                                  │
│  ┌──────────────┐    共享策略    ┌──────────────┐                │
│  │  租户 A      │──────────────►│  租户 B      │                │
│  │  (数据所有者) │   SharePolicy │  (数据消费者) │                │
│  └──────────────┘               └──────────────┘                │
│         │                              │                         │
│    ┌────▼────┐                   ┌─────▼─────┐                  │
│    │ 设备/产品 │                   │ 共享视图   │                  │
│    │ 原始数据  │ ──► 脱敏/过滤 ──► │ (只读镜像) │                  │
│    └─────────┘                   └───────────┘                  │
└──────────────────────────────────────────────────────────────────┘
```

### 5.3 共享策略 (SharePolicy)

```json
{
  "policyId": "sp_001",
  "name": "分享温湿度数据给运维商",
  "ownerTenantId": "t_001",
  "consumerTenantId": "t_002",
  "status": "ACTIVE",
  "scope": {
    "type": "PRODUCT",
    "productKeys": ["pk_smart_meter"],
    "deviceFilter": {
      "tags": { "region": "east" },
      "groupIds": ["g_factory_01"]
    }
  },
  "dataPermissions": {
    "properties": {
      "mode": "WHITELIST",
      "allowed": ["temperature", "humidity"],
      "denied": []
    },
    "events": {
      "mode": "ALL"
    },
    "services": {
      "mode": "NONE"
    },
    "telemetryHistory": {
      "enabled": true,
      "maxDays": 30
    }
  },
  "dataMasking": [
    {
      "field": "payload.gpsLocation",
      "strategy": "GEO_BLUR",
      "precision": "city"
    },
    {
      "field": "metadata.clientIp",
      "strategy": "MASK",
      "pattern": "*.*.x.x"
    }
  ],
  "rateLimit": {
    "maxQueryPerMinute": 600,
    "maxStreamMsgPerSecond": 1000
  },
  "validity": {
    "startTime": "2026-01-01T00:00:00Z",
    "endTime": "2026-12-31T23:59:59Z",
    "autoRenew": false
  },
  "audit": true,
  "createdAt": "2026-02-25T00:00:00Z"
}
```

### 5.4 共享粒度

| 粒度 | 说明 | 示例 |
|------|------|------|
| **租户级** | 共享整个租户的所有设备数据 | 集团总部查看所有子公司 |
| **产品级** | 按产品 (ProductKey) 共享 | 共享某型号传感器数据 |
| **分组级** | 按设备分组共享 | 共享某工厂的设备组 |
| **设备级** | 指定具体设备共享 | 共享特定设备给第三方 |
| **属性级** | 共享设备的部分属性 | 只共享温湿度，不共享定位 |

### 5.5 数据访问模式

| 模式 | 实现 | 适用场景 |
|------|------|---------|
| **Pull (查询)** | 消费者租户通过 API 查询共享数据，走独立的共享数据网关 | 按需查询历史数据 |
| **Push (订阅)** | 数据所有者的消息经规则引擎过滤/脱敏后转发到消费者的 Kafka Topic | 实时数据流 |
| **Materialized View** | 平台维护一份脱敏后的只读物化视图，消费者直接查询 | 大量设备的聚合分析 |

### 5.6 跨租户消息流转架构

```
租户A设备 ──► firefly-connector(内置 MQTT) ──► Kafka (t_001_raw)
                                     │
                              ┌──────▼──────┐
                              │ 共享规则引擎  │
                              │ - 权限校验    │
                              │ - 数据过滤    │
                              │ - 字段脱敏    │
                              │ - 速率限制    │
                              └──────┬──────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
          Kafka (t_002_shared)   REST API        Webhook
          (租户B实时订阅)        (租户B按需查询)   (租户B回调)
```

### 5.7 数据脱敏策略

| 策略 | 说明 | 示例 |
|------|------|------|
| **MASK** | 部分字符掩码 | `192.168.1.100` → `192.168.*.* ` |
| **HASH** | 不可逆哈希 | `device_sn` → `a3f2b8c1...` |
| **GEO_BLUR** | 地理位置模糊化 | 精确坐标 → 城市级别 |
| **ROUND** | 数值取整/降精度 | `36.6523` → `36.7` |
| **NULLIFY** | 字段置空 | 敏感字段直接移除 |
| **TOKENIZE** | 可逆令牌替换 (仅所有者可逆) | 设备名 → `tok_xxx` |
| **AGGREGATE** | 只提供聚合值 | 单设备值 → 区域平均值 |

### 5.8 共享生命周期管理

```
创建申请 → 所有者审批 → 生效(ACTIVE) → 暂停(SUSPENDED) → 恢复/过期/撤销(REVOKED)
    │            │                                              │
    │       拒绝(REJECTED)                                 数据清理
    ▼                                                     (消费者侧缓存清除)
  草稿(DRAFT)
```

### 5.9 审计与合规

| 审计项 | 记录内容 |
|--------|---------|
| **共享策略变更** | 谁在何时创建/修改/撤销了共享策略 |
| **数据访问日志** | 消费者租户的每次查询：时间、IP、查询范围、返回条数 |
| **订阅消费日志** | 实时推送的消息量、消费延迟 |
| **脱敏执行日志** | 脱敏规则触发次数、异常情况 |
| **合规报告** | 定期生成跨租户数据共享合规报告（可导出 PDF） |

### 5.10 数据库设计 (共享相关)

```
┌────────────────────┐     ┌────────────────────┐
│  share_policies    │     │  share_audit_logs  │
├────────────────────┤     ├────────────────────┤
│ id (PK)            │◄──┐ │ id (PK)            │
│ owner_tenant_id    │   │ │ policy_id (FK)     │───┘
│ consumer_tenant_id │   │ │ consumer_tenant_id │
│ name               │   │ │ action             │
│ scope (JSONB)      │   │ │ query_detail(JSONB)│
│ data_permissions   │   │ │ result_count       │
│ (JSONB)            │   │ │ ip_address         │
│ masking_rules      │   │ │ created_at         │
│ (JSONB)            │   │ └────────────────────┘
│ rate_limit (JSONB) │   │
│ validity (JSONB)   │   │ ┌────────────────────┐
│ status             │   │ │share_subscriptions │
│ audit_enabled      │   │ ├────────────────────┤
│ created_by         │   └─│ policy_id (FK)     │
│ approved_by        │     │ consumer_tenant_id │
│ created_at         │     │ kafka_topic        │
│ updated_at         │     │ status             │
└────────────────────┘     │ created_at         │
                           └────────────────────┘
```

### 5.11 API 概要

| 接口 | 方法 | 说明 | 角色 |
|------|------|------|------|
| `/api/v1/share-policies` | POST | 创建共享策略 | 数据所有者 |
| `/api/v1/share-policies/{id}` | GET/PUT/DELETE | 管理共享策略 | 数据所有者 |
| `/api/v1/share-policies/{id}/approve` | POST | 审批共享申请 | 数据所有者 |
| `/api/v1/share-policies/{id}/reject` | POST | 驳回共享申请 | 数据所有者 |
| `/api/v1/share-policies/{id}/revoke` | POST | 撤销共享 | 数据所有者 |
| `/api/v1/shared/devices` | GET | 按已批准策略查询共享设备列表 | 数据消费者 |
| `/api/v1/shared/devices/{id}/properties` | GET | 按策略查询共享设备最新属性 | 数据消费者 |
| `/api/v1/shared/devices/{id}/telemetry` | GET | 按策略查询共享设备时序数据 | 数据消费者 |
| `/api/v1/share-policies/audit-logs/list` | POST | 查询共享审计日志 | 双方 |

---

## 6. 设备接入层设计

### 6.1 协议适配器架构

```
Device ──► Protocol Adapter ──► Unified Message Envelope ──► Message Bus
                │
                ├── MQTT Adapter    (基于 Netty MQTT Codec)
                ├── CoAP Adapter    (基于 Californium)
                ├── HTTP Adapter    (基于 Netty)
                ├── WebSocket Adapter
                ├── LwM2M Adapter   (基于 Leshan)
                ├── GB/T 28181 Adapter (视频设备信令 SIP)
                ├── RTSP/RTMP Adapter  (视频推拉流)
                ├── Modbus Adapter  (通过边缘网关桥接)
                └── Custom TCP/UDP  (提供 SPI 扩展点)
```

### 6.2 统一消息信封 (Unified Message Envelope)

```json
{
  "messageId": "uuid-v7",
  "tenantId": "t_001",
  "productKey": "pk_smart_meter",
  "deviceName": "device_0001",
  "protocol": "MQTT",
  "direction": "UP",           // UP | DOWN | EVENT
  "type": "PROPERTY_REPORT",   // PROPERTY_REPORT | EVENT | SERVICE_CALL | SERVICE_REPLY | ...
  "timestamp": 1740412800000,
  "payload": { ... },
  "metadata": {
    "qos": 1,
    "clientIp": "10.0.1.55",
    "protocolVersion": "3.1.1"
  }
}
```

### 6.3 MQTT 接入详细设计

| 特性 | 说明 |
|------|------|
| **Topic 规范** | `/{tenantId}/{productKey}/{deviceName}/{type}` |
| **认证** | Username/Password、X.509 证书、Token (JWT) |
| **QoS** | 支持 0 / 1 / 2 |
| **共享订阅** | 支持 `$share/group/topic` 实现消费端负载均衡 |
| **遗嘱消息** | 设备离线自动发布状态变更事件 |
| **桥接** | 支持 MQTT Bridge 连接第三方 Broker |

### 6.4 CoAP 接入

- 基于 RFC 7252，支持 Observe (RFC 7641)
- DTLS 加密（PSK / Certificate）
- 资源路径映射：`coap://host/{tenantId}/{productKey}/{deviceName}/property`

### 6.5 自定义协议扩展 SPI

```java
public interface ProtocolAdapter {
    /** 适配器唯一标识 */
    String protocolId();
    
    /** 启动适配器，绑定端口 */
    void start(AdapterContext context);
    
    /** 停止适配器 */
    void stop();
    
    /** 将设备原始报文解码为统一消息 */
    UnifiedMessage decode(RawMessage raw);
    
    /** 将平台下行指令编码为设备报文 */
    RawMessage encode(UnifiedMessage message);
}
```

### 6.6 视频设备接入与推流

#### 6.6.1 设计背景

支持 IPC摄像头、NVR、无人机、工业视觉等视频类 IoT 设备的接入、管理与实时/录像视频流处理，作为平台的一等能力与 IoT 数据通道统一管理。

#### 6.6.2 视频接入架构

```
视频设备 (IPC/NVR/无人机)
     │
     ├── GB/T 28181 (SIP 信令 + RTP 媒体)
     ├── RTSP (拉流)
     ├── RTMP (推流)
     └── ONVIF (设备发现与管理)
     │
     ▼
┌──────────────────────────────────────────────┐
│           视频接入网关 (Video Gateway)           │
│                                              │
│  ┌────────────┐  ┌───────────┐  ┌──────────┐  │
│  │ SIP Server │  │ RTSP Proxy│  │RTMP Server│  │
│  │ (GB/T28181)│  │           │  │          │  │
│  └──────┬─────┘  └─────┬─────┘  └────┬─────┘  │
│       └───────────┴───────────┘              │
│                     │                          │
│              ┌──────▼──────┐                   │
│              │ 流媒体引擎    │                   │
│              │ (ZLMediaKit) │                   │
│              └──────┬──────┘                   │
│                     │                          │
└─────────────────────┼────────────────────────┘
                     │
        ┌───────────┼─────────────┐
        ▼            ▼             ▼
  HLS/FLV/WebRTC  录像存储      事件回调
  (实时播放)    (MinIO/S3)   (移动侦测/AI)
```

#### 6.6.3 支持的视频协议

| 协议 | 方向 | 说明 |
|------|------|------|
| **GB/T 28181** | 设备 → 平台 | 国标视频监控协议，SIP 信令 + RTP/PS 媒体流；支持设备注册、目录订阅、实时点播、历史回放、云台控制 (PTZ) |
| **RTSP** | 平台 → 设备 | 拉流协议，主动从 IPC/NVR 拉取视频流；支持 TCP/UDP 传输 |
| **RTMP** | 设备 → 平台 | 推流协议，适用于无人机、移动设备主动推流 |
| **ONVIF** | 双向 | 设备发现、配置管理、PTZ 控制、事件订阅 |
| **HLS** | 平台 → 客户端 | HTTP 分片直播，兼容性最好，延迟 3-10s |
| **HTTP-FLV** | 平台 → 客户端 | HTTP 长连接拉流，延迟 1-3s |
| **WebRTC** | 平台 ↔ 客户端 | 超低延迟实时播放 (<500ms)，支持双向音视频对讲 |

#### 6.6.4 流媒体服务器

基于 **ZLMediaKit** 作为核心流媒体引擎（高性能 C++ 实现），Java 服务通过 RESTful API 管控：

| 特性 | 说明 |
|------|------|
| **协议转换** | RTSP/RTMP/GB28181 → HLS/FLV/WebRTC 自动转封装 |
| **多路复用** | 单路源流支持多人同时观看，按需拉流避免资源浪费 |
| **录像存储** | 支持 MP4/FLV 录制，存储到 MinIO (S3 兼容) |
| **截图拍照** | 定时/事件触发截图，存储到对象存储 |
| **水印叠加** | 支持时间戳、租户名、设备名叠加 |
| **集群模式** | 多节点流媒体集群，支持流负载均衡和故障转移 |
| **GPU 加速** | 可选 NVIDIA 硬件转码 (NVENC/NVDEC) |

#### 6.6.5 GB/T 28181 接入流程

```
1. 设备注册
   IPC ── SIP REGISTER ──► SIP Server ──► 设备管理服务 (自动创建设备记录)

2. 目录查询
   平台 ── SIP MESSAGE (Catalog) ──► IPC ──► 返回通道列表

3. 实时点播
   客户端 ── 播放请求 ──► 平台 ── SIP INVITE ──► IPC
   IPC ── RTP/PS 流 ──► ZLMediaKit ── HLS/FLV/WebRTC ──► 客户端

4. 云台控制
   客户端 ── PTZ 指令 ──► 平台 ── SIP MESSAGE ──► IPC

5. 历史回放
   客户端 ── 回放请求 ──► 平台 ── SIP INVITE (Playback) ──► NVR/IPC
```

#### 6.6.6 视频设备物模型扩展

视频设备在标准物模型基础上扩展视频专属能力：

```json
{
  "productKey": "pk_ipc_camera",
  "category": "VIDEO",
  "properties": [
    { "identifier": "manufacturer", "name": "厂商", "dataType": { "type": "string" }, "accessMode": "r" },
    { "identifier": "channelCount", "name": "通道数", "dataType": { "type": "int" }, "accessMode": "r" },
    { "identifier": "streamStatus", "name": "推流状态", "dataType": { "type": "enum", "values": {"0": "停止", "1": "推流中"} }, "accessMode": "r" },
    { "identifier": "resolution", "name": "分辨率", "dataType": { "type": "string" }, "accessMode": "r" },
    { "identifier": "bitrate", "name": "码率(kbps)", "dataType": { "type": "int" }, "accessMode": "rw" },
    { "identifier": "recordStatus", "name": "录像状态", "dataType": { "type": "enum", "values": {"0": "停止", "1": "录像中"} }, "accessMode": "r" }
  ],
  "events": [
    { "identifier": "motionDetect", "name": "移动侦测", "type": "alert", "outputData": [
      { "identifier": "snapshotUrl", "dataType": { "type": "string" } },
      { "identifier": "confidence", "dataType": { "type": "float" } }
    ]},
    { "identifier": "videoLoss", "name": "视频丢失", "type": "fault" },
    { "identifier": "storageAlert", "name": "存储空间不足", "type": "alert" }
  ],
  "services": [
    { "identifier": "startStream", "name": "开始推流", "callType": "async",
      "inputData": [{ "identifier": "channel", "dataType": { "type": "int" } }],
      "outputData": [
        { "identifier": "flvUrl", "dataType": { "type": "string" } },
        { "identifier": "hlsUrl", "dataType": { "type": "string" } },
        { "identifier": "webrtcUrl", "dataType": { "type": "string" } }
      ]
    },
    { "identifier": "stopStream", "name": "停止推流", "callType": "async" },
    { "identifier": "ptzControl", "name": "云台控制", "callType": "async",
      "inputData": [
        { "identifier": "command", "dataType": { "type": "enum", "values": {"0":"停止","1":"上","2":"下","3":"左","4":"右","5":"放大","6":"缩小"} } },
        { "identifier": "speed", "dataType": { "type": "int", "min": 1, "max": 255 } }
      ]
    },
    { "identifier": "snapshot", "name": "截图", "callType": "async",
      "outputData": [{ "identifier": "imageUrl", "dataType": { "type": "string" } }]
    },
    { "identifier": "startRecord", "name": "开始录像", "callType": "async" },
    { "identifier": "stopRecord", "name": "停止录像", "callType": "async",
      "outputData": [{ "identifier": "recordUrl", "dataType": { "type": "string" } }]
    }
  ]
}
```

#### 6.6.7 视频播放 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/devices/video/{id}/channels` | GET | 获取视频设备通道列表 |
| `/api/v1/devices/video` | POST | 创建设备资产下的视频设备 |
| `/api/v1/devices/video/list` | POST | 分页查询视频设备资产 |
| `/api/v1/devices/video/{id}` | GET | 获取视频设备资产详情 |
| `/api/v1/devices/video/{id}` | PUT | 更新视频设备资产 |
| `/api/v1/devices/video/{id}` | DELETE | 删除视频设备资产 |
| `/api/v1/video/devices/{id}/start` | POST | 开始实时播放，返回播放地址 (FLV/HLS/WebRTC) |
| `/api/v1/video/devices/{id}/stop` | POST | 停止播放 |
| `/api/v1/video/devices/{id}/ptz` | POST | 云台控制 (PTZ) |
| `/api/v1/video/devices/{id}/snapshot` | POST | 截图 |
| `/api/v1/video/devices/{id}/record/start` | POST | 开始录像 |
| `/api/v1/video/devices/{id}/record/stop` | POST | 停止录像 |

#### 6.6.8 多租户视频隔离

| 维度 | 实现 |
|------|------|
| **信令隔离** | SIP 域 (realm) 按 tenant 隔离，设备 SIP ID 包含 tenantId 前缀 |
| **媒体流隔离** | 流 ID 含 tenantId；播放鉴权校验租户归属 |
| **存储隔离** | 录像文件按 `/{tenantId}/{deviceId}/{date}/` 路径存储于 MinIO |
| **带宽配额** | per-tenant 视频带宽限制，防止单租户占用过多资源 |

---

## 7. 设备管理核心

### 7.1 物模型 (Thing Model)

物模型是设备能力的抽象描述，采用 JSON Schema 扩展格式：

```json
{
  "productKey": "pk_smart_meter",
  "properties": [
    {
      "identifier": "temperature",
      "name": "温度",
      "dataType": { "type": "float", "min": -40, "max": 125, "unit": "°C", "precision": 1 },
      "accessMode": "r",
      "required": true
    }
  ],
  "events": [
    {
      "identifier": "temperatureAlarm",
      "name": "温度告警",
      "type": "alert",
      "outputData": [
        { "identifier": "alarmType", "dataType": { "type": "enum", "values": {"0": "低温", "1": "高温"} } }
      ]
    }
  ],
  "services": [
    {
      "identifier": "setInterval",
      "name": "设置采集间隔",
      "callType": "async",
      "inputData": [
        { "identifier": "interval", "dataType": { "type": "int", "min": 1, "max": 3600, "unit": "s" } }
      ],
      "outputData": []
    }
  ]
}
```

### 7.2 设备生命周期

```
                   ┌──────────────┐
                   │   未激活      │
                   │ (Inactive)   │
                   └──────┬───────┘
                          │ 首次上线 / 激活
                   ┌──────▼───────┐
              ┌────│   在线        │────┐
              │    │  (Online)    │    │
              │    └──────┬───────┘    │
         心跳超时  │       │ 主动断开   │ 禁用
              │    │       │            │
              ▼    │  ┌────▼───────┐    │
         ┌────────┐│  │   离线      │    │
         │ 离线   ││  │ (Offline)  │    │
         │(Offline)│  └────────────┘    │
         └────────┘                     │
                                  ┌─────▼──────┐
                                  │   已禁用    │
                                  │ (Disabled) │
                                  └─────┬──────┘
                                        │ 删除
                                  ┌─────▼──────┐
                                  │   已删除    │
                                  │ (Deleted)  │ (逻辑删除，保留30天)
                                  └────────────┘
```

### 7.3 核心功能列表

| 功能 | 说明 |
|------|------|
| **产品管理** | 产品 CRUD、物模型定义、Topic 管理、固件版本 |
| **设备注册** | 动态注册（一型一密）、预注册（一机一密）、批量导入 |
| **设备分组** | 静态分组 + 动态分组（基于标签/属性条件） |
| **设备影子** | 期望值 / 上报值 JSON 文档，支持版本控制与差量同步 |
| **远程配置** | 配置版本管理，支持按产品/分组/设备下发 |
| **远程调试** | 在线日志查看、命令下发、属性读写 |
| **OTA 升级** | 固件管理、灰度发布、差分升级、升级状态跟踪 |
| **设备标签** | Key-Value 标签，支持搜索和动态分组 |
| **拓扑关系** | 网关-子设备绑定、设备间关联 |

### 7.4 设备认证方式

| 方式 | 适用场景 | 安全等级 |
|------|---------|---------|
| **一机一密** (DeviceSecret) | 预注册设备 | ★★★ |
| **一型一密** + 动态注册 | 量产设备批量激活 | ★★ |
| **X.509 证书** | 高安全要求场景 | ★★★★ |
| **SAS Token** (时效令牌) | 短期访问 | ★★★ |

---

## 8. 规则引擎与数据流

### 8.1 规则引擎架构

```
设备消息 ──► 规则引擎入口 ──► SQL 筛选 ──► 转换 ──► 动作(Action)
                                                      │
                              ┌────────────────────────┤
                              ▼            ▼           ▼           ▼
                         数据库写入    消息转发      Webhook     告警通知
                         (TDB/PG)   (Kafka)    (HTTP POST)  (邮件/短信)
                              ▼
                         自定义函数 (Serverless)
```

### 8.2 规则 SQL 语法

```sql
SELECT
  deviceName,
  payload.temperature AS temp,
  payload.humidity AS humi,
  timestamp
FROM
  "t_001/pk_smart_meter/+/PROPERTY_REPORT"
WHERE
  payload.temperature > 50
```

### 8.3 内置动作类型

| 动作 | 说明 |
|------|------|
| **数据存储** | 写入 TimescaleDB / InfluxDB / TDengine |
| **消息转发** | 转发到 Kafka / RabbitMQ / RocketMQ 等外部 MQ |
| **HTTP 推送** | Webhook POST 到外部系统 |
| **邮件通知** | SMTP 邮件告警 |
| **短信通知** | 对接短信网关 |
| **设备联动** | 触发其他设备指令下发 |
| **Serverless** | 调用用户自定义 JavaScript/Python 函数 |

### 8.4 数据流水线 (Data Pipeline)

支持多规则串联形成 DAG 流水线：

```
源消息 → 解析规则 → 过滤规则 → 聚合规则 → 存储/告警
                       ↘ 备份规则 → S3 归档
```

---

## 9. 数据存储设计

### 9.1 存储选型

| 数据类别 | 存储引擎 | 说明 |
|---------|---------|------|
| **设备元数据** | PostgreSQL 16+ | 产品、设备、租户、用户等结构化数据 |
| **时序数据** | TimescaleDB / TDengine | 设备属性上报、事件日志 |
| **设备影子** | Redis 7+ (JSON) | 毫秒级读写，支持 JSON Path 查询 |
| **会话/在线状态** | Redis Cluster | 百万级设备在线状态 bitmap |
| **固件/文件** | MinIO (S3 兼容) | OTA 固件包、导入导出文件 |
| **搜索/日志** | Elasticsearch 8+ | 设备搜索、操作日志、审计日志 |
| **规则配置** | PostgreSQL | 规则定义、动作配置 |

### 9.2 多租户数据隔离方案

```
方案一：共享数据库 + RLS（默认）
  ┌─────────────────────────────┐
  │  PostgreSQL                 │
  │  ┌──────────────────────┐   │
  │  │ Table: devices        │   │
  │  │ + tenant_id (分区键) │   │
  │  │ + RLS Policy          │   │
  │  └──────────────────────┘   │
  └─────────────────────────────┘

方案二：Schema-per-Tenant（中型客户）
  ┌─────────────────────────────┐
  │  PostgreSQL                 │
  │  ├── schema: tenant_001     │
  │  ├── schema: tenant_002     │
  │  └── schema: tenant_003     │
  └─────────────────────────────┘

方案三：Database-per-Tenant（大型客户）
  ┌────────────┐ ┌────────────┐ ┌────────────┐
  │ PG: t_001  │ │ PG: t_002  │ │ PG: t_003  │
  └────────────┘ └────────────┘ └────────────┘
```

### 9.3 时序数据分区策略

```sql
-- TimescaleDB 超表，按 tenant_id + time 分区
SELECT create_hypertable(
  'device_telemetry',
  'ts',
  partitioning_column => 'tenant_id',
  number_partitions => 16,
  chunk_time_interval => INTERVAL '1 day'
);

-- 自动数据保留策略
SELECT add_retention_policy('device_telemetry', INTERVAL '90 days');

-- 连续聚合（降采样）
CREATE MATERIALIZED VIEW telemetry_hourly
WITH (timescaledb.continuous) AS
SELECT
  tenant_id, device_id,
  time_bucket('1 hour', ts) AS bucket,
  avg(value) AS avg_val,
  max(value) AS max_val,
  min(value) AS min_val
FROM device_telemetry
GROUP BY tenant_id, device_id, bucket;
```

---

## 10. 快速部署方案

### 10.1 部署模式总览

| 模式 | 适用场景 | 部署时间 | 设备规模 |
|------|---------|---------|---------|
| **单机 Docker Compose** | 开发/测试/演示 | ≤ 5 min | ≤ 1,000 |
| **K8s Helm Chart** | 生产环境 | ≤ 15 min | ≤ 100 万+ |
| **Terraform + Helm** | 云上自动化部署 | ≤ 30 min | ≤ 100 万+ |
| **边缘轻量版** | 网关/边缘节点 | ≤ 3 min | ≤ 100 |

### 10.2 Docker Compose 一键启动

```bash
# 克隆项目
git clone https://github.com/example/firefly-iot.git
cd firefly-iot

# 一键启动（含所有依赖）
docker compose -f deploy/docker-compose.yml up -d

# 访问管理控制台
# http://localhost:8080  (admin / admin123)
```

`docker-compose.yml` 核心组件：

```yaml
services:
  firefly-gateway:    # Spring Cloud Gateway 网关
  firefly-api:        # 业务服务 (All-in-One)
  firefly-protocol:   # 协议接入层
  nacos:              # 注册中心 + 配置中心
  postgres:           # 元数据 + 时序数据 (TimescaleDB)
  redis:              # 缓存 + 会话
  kafka:              # 消息总线 (KRaft 模式，无 ZooKeeper)
  zlmediakit:         # 流媒体服务器 (GB28181/RTSP/RTMP → HLS/FLV/WebRTC)
  firefly-video:      # 视频接入网关 (SIP 信令)
  minio:              # 对象存储 (固件 + 录像)
  firefly-web:        # 前端 React SPA
```

### 10.3 Kubernetes Helm 部署

```bash
# 添加 Helm 仓库
helm repo add firefly https://charts.firefly-iot.io
helm repo update

# 最小化生产部署
helm install firefly-iot firefly/firefly-iot \
  --namespace iot-platform --create-namespace \
  --set global.storageClass=gp3 \
  --set mqtt.replicas=3 \
  --set api.replicas=2 \
  --set kafka.replicas=3 \
  -f values-production.yaml

# 查看部署状态
kubectl -n iot-platform get pods
```

### 10.4 Helm Chart 关键配置

```yaml
# values-production.yaml
global:
  tenantMode: shared          # shared | schema | database
  domain: iot.example.com
  tls:
    enabled: true
    issuer: letsencrypt-prod

mqtt:
  replicas: 3
  maxConnections: 500000      # 每节点 50 万，3 节点共 150 万
  resources:
    requests: { cpu: "2", memory: "4Gi" }
    limits:   { cpu: "4", memory: "8Gi" }
  hpa:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPU: 70

api:
  replicas: 2
  hpa:
    enabled: true
    minReplicas: 2
    maxReplicas: 8

ruleEngine:
  replicas: 2
  hpa:
    enabled: true

postgres:
  enabled: true               # false 则使用外部数据库
  timescaledb: true
  replicas: 2                 # 主从
  storage: 100Gi

redis:
  cluster:
    enabled: true
    replicas: 6

nacos:
  replicas: 3
  storage: 10Gi
  mysql:
    enabled: true             # Nacos 内置 MySQL 存储

kafka:
  kraft: true                 # KRaft 模式
  replicas: 3
  storage: 50Gi

sentinel:
  dashboard:
    enabled: true

monitoring:
  prometheus: true
  grafana: true
  alertmanager: true
```

### 10.5 环境矩阵

| 环境 | 最低配置 | 推荐配置 |
|------|---------|---------|
| **开发/演示** | 2 CPU / 4 GB RAM / 20 GB Disk | 4 CPU / 8 GB RAM / 50 GB Disk |
| **生产 (10 万设备)** | 8 CPU / 16 GB RAM / 200 GB SSD | 16 CPU / 32 GB RAM / 500 GB SSD |
| **生产 (100 万设备)** | 集群：3+ Node，每 Node 8C16G | 集群：5+ Node，每 Node 16C32G |

---

## 11. 百万级设备支撑架构

### 11.1 性能模型

```
假设:
  - 100 万设备同时在线
  - 每设备每 30 秒上报一次
  - 平均消息大小 200 Bytes

计算:
  - 消息吞吐: 1,000,000 / 30 ≈ 33,333 msg/s ≈ 2,000,000 msg/min
  - 带宽: 33,333 × 200B ≈ 6.3 MB/s ≈ 50 Mbps (入向)
  - 日数据量: 33,333 × 200 × 86400 ≈ 550 GB/天 (原始)
```

### 11.2 水平扩展策略

```
                       ┌──────────────┐
                       │   LB (L4)    │
                       │  (HAProxy/   │
                       │   NLB)       │
                       └──────┬───────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ MQTT     │   │ MQTT     │   │ MQTT     │
        │ Node 1   │   │ Node 2   │   │ Node 3   │
        │ (350K    │   │ (350K    │   │ (350K    │
        │  conn)   │   │  conn)   │   │  conn)   │
        └────┬─────┘   └────┬─────┘   └────┬─────┘
             │               │               │
             └───────────────┼───────────────┘
                             ▼
                    ┌─────────────────┐
                    │ Kafka Cluster   │
                    │ (3-5 Brokers)   │
                    │ 分区: 按tenantId │
                    │ + deviceId hash │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Worker 1 │  │ Worker 2 │  │ Worker 3 │
        │ (规则/   │  │ (规则/   │  │ (规则/   │
        │  存储)   │  │  存储)   │  │  存储)   │
        └──────────┘  └──────────┘  └──────────┘
```

### 11.3 关键优化措施

| 领域 | 优化措施 |
|------|---------|
| **连接管理** | Netty epoll/io_uring transport；单 JVM 50 万连接；ByteBuf 池化内存管理 |
| **消息路由** | 本地 Trie 树 Topic 匹配 + 集群级 Consistent Hashing |
| **序列化** | Protobuf 内部通信；设备侧支持 CBOR / MessagePack |
| **批量写入** | 时序数据微批写入（每 500ms 或 1000 条） |
| **设备状态** | Redis Bitmap 存储在线状态，O(1) 查询 |
| **数据库** | 按 tenant_id 分区；读写分离；连接池 (PgBouncer) |
| **缓存** | 产品/物模型 L1 本地缓存 + L2 Redis 缓存 |
| **GC 优化** | Java 21 ZGC (Generational)；接入层启用 Shenandoah 低延迟 GC；堆内存建议 8-16 GB |

### 11.4 压测基准 (目标)

| 指标 | 目标值 |
|------|-------|
| MQTT 连接建立速率 | ≥ 10,000 conn/s |
| 消息吞吐 | ≥ 50,000 msg/s (3 节点) |
| 消息延迟 P99 | ≤ 200 ms |
| API 响应 P99 | ≤ 500 ms |
| 规则引擎吞吐 | ≥ 30,000 event/s |
| 设备上线（冷启动恢复） | 100 万设备 ≤ 10 min |

---

## 12. 安全体系

### 12.1 安全架构分层

```
┌─────────────────────────────────────────┐
│           应用安全                        │
│  RBAC · API Key · OAuth2 · ABAC         │
├─────────────────────────────────────────┤
│           传输安全                        │
│  TLS 1.3 · DTLS · mTLS                  │
├─────────────────────────────────────────┤
│           设备安全                        │
│  X.509 · SAS Token · 安全启动            │
├─────────────────────────────────────────┤
│           数据安全                        │
│  AES-256 加密存储 · 字段级加密可选         │
├─────────────────────────────────────────┤
│           审计安全                        │
│  操作审计 · 登录审计 · 合规报告           │
└─────────────────────────────────────────┘
```

### 12.2 RBAC 权限模型

```
Platform Admin (超级管理员)
  └── Tenant Admin (租户管理员)
        ├── Project Admin (项目管理员)
        │     ├── Developer (开发者：设备管理、规则配置)
        │     ├── Operator  (运维：监控、告警、OTA)
        │     └── Viewer    (只读)
        └── Custom Role (自定义角色：细粒度权限组合)
```

权限粒度：`resource:action`，例如：
- `device:create`、`device:read`、`device:delete`
- `rule:create`、`rule:enable`、`rule:delete`
- `ota:upload`、`ota:deploy`、`ota:rollback`

### 12.3 API 安全

| 机制 | 说明 |
|------|------|
| **OAuth 2.0 / OIDC** | 用户端认证，支持 SSO |
| **API Key + Secret** | 服务间调用，HMAC 签名 |
| **JWT** | 无状态 Token，RS256 签名 |
| **速率限制** | Per-tenant / per-user / per-IP 多级限流 |
| **IP 白名单** | 可选的 API 访问 IP 限制 |

### 12.4 多平台登录体系

#### 12.4.1 支持的客户端平台

| 平台 | 技术方案 | 说明 |
|------|---------|------|
| **Web 管理端** | React 18 + Ant Design Pro | 企业管理后台，完整功能 |
| **iOS App** | React Native / Flutter | 设备控制、数据查看、视频监控、告警推送 |
| **Android App** | React Native / Flutter | 同 iOS，支持厂商推送通道 (FCM/华为/小米/OPPO) |
| **微信小程序** | Taro / uni-app 编译 | 轻量级设备控制、数据查看、扫码绑定设备 |
| **支付宝小程序** | Taro / uni-app 编译 | 同微信小程序，复用同一套代码 |

#### 12.4.2 统一认证架构

```
                    ┌─────────────────────────────────┐
                    │       Spring Cloud Gateway       │
                    │     (统一入口 + Token 校验)       │
                    └───────────────┬─────────────────┘
                                    │
                    ┌───────────────▼─────────────────┐
                    │       认证中心 (Auth Service)     │
                    │                                  │
                    │  ┌──────────┐  ┌──────────────┐  │
                    │  │ OAuth2   │  │ 第三方登录     │  │
                    │  │ Server   │  │ (微信/支付宝/ │  │
                    │  │          │  │  Apple/钉钉)  │  │
                    │  └────┬─────┘  └──────┬───────┘  │
                    │       └───────┬───────┘          │
                    │               ▼                  │
                    │       ┌──────────────┐           │
                    │       │ Token 管理    │           │
                    │       │ (JWT + Redis) │           │
                    │       └──────────────┘           │
                    └──────────────────────────────────┘
```

#### 12.4.3 登录方式矩阵

| 登录方式 | Web | APP | 小程序 | 说明 |
|---------|-----|-----|--------|------|
| **账号密码** | ✅ | ✅ | ✅ | 用户名/邮箱/手机号 + 密码 |
| **短信验证码** | ✅ | ✅ | ✅ | 手机号 + 6 位验证码 |
| **微信登录** | ✅ (扫码) | ✅ (SDK) | ✅ (wx.login) | 微信开放平台 UnionID 体系 |
| **支付宝登录** | ❌ | ✅ (SDK) | ✅ (my.getAuthCode) | 支付宝开放平台 |
| **钉钉登录** | ✅ (扫码) | ✅ (SDK) | ❌ | 企业级场景，免密登录 |
| **Apple 登录** | ❌ | ✅ (iOS) | ❌ | Sign in with Apple (iOS 强制要求) |
| **SSO/LDAP** | ✅ | ✅ | ❌ | 企业私有化部署对接内部身份系统 |
| **扫码登录** | ✅ | ❌ (扫码端) | ❌ (扫码端) | APP/小程序扫码 → Web 免密登录 |

#### 12.4.4 Token 管理策略

| 策略 | 说明 |
|------|------|
| **双 Token 机制** | Access Token (短效 2h) + Refresh Token (长效 30d)；Access Token 过期后用 Refresh Token 无感续签 |
| **多端同时在线** | 每个平台 (Web/APP/小程序) 独立 Token，互不影响；可配置同一平台是否允许多设备登录 |
| **设备指纹** | 客户端生成设备指纹 (Device Fingerprint)，绑定 Token 防止盗用 |
| **强制下线** | 管理员可强制踢下线指定用户的指定平台会话 |
| **Token 黑名单** | 注销/修改密码/强制下线时，将 Token 加入 Redis 黑名单，实时生效 |
| **并发会话控制** | 可配置单平台最大同时在线数（默认 Web: 3, APP: 2, 小程序: 2） |

#### 12.4.5 多平台会话数据模型

```json
{
  "userId": "u_001",
  "tenantId": "t_001",
  "sessions": [
    {
      "sessionId": "sess_abc",
      "platform": "WEB",
      "deviceFingerprint": "fp_xxxx",
      "loginMethod": "PASSWORD",
      "loginIp": "10.0.1.55",
      "userAgent": "Chrome/120",
      "accessToken": "eyJ...",
      "refreshToken": "rt_...",
      "createdAt": "2026-02-25T10:00:00Z",
      "expiresAt": "2026-02-25T12:00:00Z",
      "lastActiveAt": "2026-02-25T10:30:00Z"
    },
    {
      "sessionId": "sess_def",
      "platform": "APP_IOS",
      "deviceFingerprint": "fp_yyyy",
      "loginMethod": "WECHAT",
      "pushToken": "apns://xxxxx",
      "createdAt": "2026-02-25T09:00:00Z",
      "expiresAt": "2026-03-27T09:00:00Z"
    },
    {
      "sessionId": "sess_ghi",
      "platform": "MINI_PROGRAM_WECHAT",
      "openId": "oXXXX",
      "unionId": "uXXXX",
      "loginMethod": "WECHAT_MINI",
      "createdAt": "2026-02-25T08:00:00Z"
    }
  ]
}
```

#### 12.4.6 第三方登录对接流程

```
1. 微信小程序登录
   小程序 ── wx.login() ──► 获取 code
   小程序 ── POST /api/v1/auth/wechat-mini ──► 认证中心
   认证中心 ── code2session ──► 微信服务器 ──► 返回 openId/unionId
   认证中心 ──► 查找/创建用户 ──► 签发 JWT ──► 返回给小程序

2. APP 微信登录
   APP ── 微信 SDK 授权 ──► 获取 code
   APP ── POST /api/v1/auth/wechat ──► 认证中心
   认证中心 ── 获取 access_token + openId ──► 微信开放平台
   认证中心 ──► 查找/创建用户 (UnionID 关联) ──► 签发 JWT

3. Web 扫码登录
   Web ── GET /api/v1/auth/qrcode ──► 认证中心 ──► 返回二维码 + qrcodeId
   Web ── WebSocket 轮询 /api/v1/auth/qrcode/{id}/status
   APP/小程序 ── 扫码 ──► POST /api/v1/auth/qrcode/{id}/confirm
   认证中心 ──► WebSocket 通知 Web ──► 签发 JWT
```

#### 12.4.7 推送通知集成

| 平台 | 推送通道 | 说明 |
|------|---------|------|
| **iOS** | APNs (Apple Push Notification service) | 设备告警、OTA 通知、视频事件 |
| **Android** | FCM + 厂商通道 (华为/小米/OPPO/vivo) | 多通道保活，确保到达率 |
| **微信小程序** | 订阅消息 (subscribeMessage) | 用户主动订阅后可推送设备告警 |
| **Web** | WebSocket / SSE | 实时推送，前端长连接 |

#### 12.4.8 多平台 API 差异化

```
API 统一基础路径: /api/v1/

平台差异通过 Header 区分:
  X-Platform: WEB | APP_IOS | APP_ANDROID | MINI_WECHAT | MINI_ALIPAY

平台特有接口:
  POST /api/v1/auth/wechat-mini     # 小程序微信登录
  POST /api/v1/auth/wechat           # APP 微信登录
  POST /api/v1/auth/alipay           # 支付宝登录
  POST /api/v1/auth/apple            # Apple 登录
  POST /api/v1/auth/dingtalk         # 钉钉登录
  POST /api/v1/auth/sms              # 短信验证码登录
  POST /api/v1/auth/qrcode           # 扫码登录 (生成二维码)
  POST /api/v1/auth/qrcode/{id}/confirm  # 扫码确认
  POST /api/v1/auth/refresh          # Token 刷新
  POST /api/v1/auth/logout           # 登出 (当前平台)
  POST /api/v1/auth/logout-all       # 登出所有平台
  PUT  /api/v1/user/push-token       # 上报推送 Token (APP)
  GET  /api/v1/user/sessions         # 查询当前用户所有会话
  DELETE /api/v1/user/sessions/{id}  # 踢下线指定会话
```

---

## 13. 可观测性

### 13.1 三大支柱

| 支柱 | 工具 | 说明 |
|------|------|------|
| **Metrics** | Prometheus + Grafana | 系统指标、业务指标、SLA 仪表板 |
| **Logging** | Loki / Elasticsearch + Kibana | 结构化日志、全链路 TraceID |
| **Tracing** | OpenTelemetry + Jaeger / Tempo | 分布式调用链追踪 |

### 13.2 核心监控指标

| 类别 | 指标 |
|------|------|
| **设备** | 在线数、连接速率、掉线率、认证失败率 |
| **消息** | 吞吐量 (msg/s)、延迟 (P50/P95/P99)、丢弃率 |
| **规则引擎** | 触发次数、执行延迟、错误率 |
| **系统** | CPU/Memory/Disk/Network、GC 暂停时间 |
| **租户** | Per-tenant 消息量、设备数、API 调用量 |
| **SLA** | 可用性、消息送达率、API 成功率 |

### 13.3 告警规则 (示例)

```yaml
groups:
  - name: firefly-iot-alerts
    rules:
      - alert: HighDeviceDisconnectRate
        expr: rate(mqtt_disconnections_total[5m]) > 100
        for: 2m
        labels: { severity: warning }
        annotations:
          summary: "设备掉线速率过高 ({{ $value }}/s)"

      - alert: MessageLatencyHigh
        expr: histogram_quantile(0.99, rate(message_latency_seconds_bucket[5m])) > 0.2
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: "消息 P99 延迟超过 200ms"

      - alert: TenantQuotaExceeded
        expr: tenant_device_count / tenant_device_quota > 0.9
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: "租户 {{ $labels.tenant_id }} 设备配额使用率超过 90%"
```

---

## 14. 开放能力与集成

### 14.1 Open API

| API 类别 | 说明 | 协议 |
|---------|------|------|
| **设备管理 API** | 产品/设备 CRUD、影子读写 | REST (OpenAPI 3.1) |
| **数据查询 API** | 时序数据查询、聚合分析 | REST + GraphQL |
| **规则管理 API** | 规则 CRUD、启停 | REST |
| **系统管理 API** | 租户、用户、权限 | REST |
| **实时推送 API** | 服务端事件订阅 | WebSocket / SSE |
| **高性能 API** | 批量操作、内部服务调用 | gRPC |

### 14.2 集成生态

```
                    ┌────────────────────────┐
                    │     Firefly-IoT        │
                    └───────────┬────────────┘
                                │
      ┌──────────────┬──────────┼──────────┬──────────────┐
      ▼              ▼          ▼          ▼              ▼
  ┌────────┐   ┌─────────┐ ┌────────┐ ┌────────┐  ┌───────────┐
  │ Kafka  │   │ 数据库   │ │ 云服务 │ │ BI工具 │  │ 第三方    │
  │ Connect│   │ Sink    │ │        │ │        │  │ 平台      │
  │        │   │ PG/MySQL│ │ AWS    │ │Grafana │  │ 钉钉/企微 │
  │        │   │ ClickHse│ │ Azure  │ │Tableau │  │ Slack     │
  └────────┘   └─────────┘ │ GCP    │ │ Metabs │  │ PagerDuty │
                            └────────┘ └────────┘  └───────────┘
```

### 14.3 Webhook 事件

| 事件 | Payload |
|------|---------|
| `device.created` | 设备创建信息 |
| `device.online` | 设备上线，含 IP、协议 |
| `device.offline` | 设备离线，含原因 |
| `device.property.report` | 属性上报数据 |
| `device.event.fired` | 事件触发 |
| `alert.triggered` | 告警触发 |
| `ota.progress` | OTA 升级进度 |
| `tenant.quota.warning` | 配额告警 |
| `video.device.registered` | 视频设备注册 (GB28181 SIP 注册成功) |
| `video.stream.started` | 视频流开始，含播放地址 |
| `video.stream.stopped` | 视频流停止 |
| `video.motion.detected` | 移动侦测事件，含截图 URL |
| `video.record.completed` | 录像完成，含文件地址 |
| `share.policy.created` | 共享策略创建 |
| `share.policy.approved` | 共享策略审批通过 |
| `share.policy.revoked` | 共享策略撤销 |

---

## 15. 产品功能模块清单

### 15.1 控制台功能

| 模块 | 功能 | 优先级 |
|------|------|--------|
| **仪表板** | 总览面板（设备统计、消息趋势、告警概览）；可定制 Dashboard | P0 |
| **租户管理** | 租户 CRUD、配额管理、计费统计、资源隔离配置 | P0 |
| **产品管理** | 产品创建、物模型编辑（可视化 + JSON）、Topic 管理 | P0 |
| **设备管理** | 设备列表/搜索/详情、分组、标签、批量操作 | P0 |
| **设备详情** | 实时数据、历史数据图表、设备影子、事件日志、在线调试 | P0 |
| **规则引擎** | 可视化规则编辑器、SQL 编辑器、动作配置、调试运行 | P0 |
| **告警中心** | 告警规则、告警记录、消息模板 | P0 |
| **视频监控** | 实时预览、历史回放、PTZ 云台控制、截图、录像管理、通道管理 | P0 |
| **OTA 升级** | 固件上传、升级任务创建、灰度策略、进度跟踪 | P1 |
| **数据分析** | 时序数据查询、聚合统计、数据导出 | P1 |
| **用户权限** | 用户管理、角色管理、权限分配、API Key 管理 | P0 |
| **多平台登录** | 账号密码、短信验证码、微信/支付宝/钉钉/Apple 登录、扫码登录、SSO、会话管理 | P0 |
| **系统设置** | 平台参数、日志配置、通知渠道 | P1 |
| **审计日志** | 操作日志查询、登录日志、数据变更记录 | P1 |
| **跨租户共享** | 共享策略管理、审批流、脱敏配置、共享数据查看、审计日志 | P1 |
| **API 文档** | 内嵌 Swagger UI / Redoc，支持在线调试 | P1 |

### 15.2 管理端功能 (Platform Admin)

| 功能 | 说明 |
|------|------|
| 租户总览 | 所有租户的设备数、消息量、资源使用 |
| 资源调度 | 租户间资源分配与调度 |
| 系统监控 | 集群健康、节点状态、组件状态 |
| 升级管理 | 平台版本升级、滚动更新 |
| 备份恢复 | 全量/增量备份、灾难恢复 |

---

## 16. 技术选型总览

| 层级 | 技术 | 选型理由 |
|------|------|---------|
| **后端语言** | Java 21 (LTS) | 虚拟线程 (Virtual Threads) 支持高并发；生态成熟；团队技术栈统一 |
| **微服务框架** | Spring Boot 3.3 + Spring Cloud Alibaba 2023 | 阿里微服务全家桶，国内生态成熟，企业级生产验证 |
| **注册/配置中心** | Nacos 2.x | 服务发现 + 动态配置一体化，支持多租户 Namespace 隔离 |
| **流量控制** | Sentinel 1.8+ | 限流、熔断、降级，支持 per-tenant 规则动态推送 |
| **响应式框架** | Spring WebFlux + Project Reactor | 协议网关 / 接入层高并发非阻塞 IO |
| **Web 前端** | React 18 + TypeScript + Ant Design Pro | 企业级管理后台最佳实践 |
| **移动端 APP** | React Native / Flutter | iOS + Android 跨平台开发，一套代码多端发布 |
| **小程序** | Taro 3.x + React | 微信/支付宝多端编译，复用 React 技术栈 |
| **协议网关** | 自研 (基于 Netty 4 + 虚拟线程) | 可定制协议解析，Netty 是 Java 高性能网络框架标杆 |
| **MQTT Broker** | `firefly-connector` 内置 Broker（Moquette） | 默认随 connector 部署，结合 Redis 路由、节点心跳和 Kafka 共享消费组支持水平扩容 |
| **流媒体服务器** | ZLMediaKit | 高性能 C++ 流媒体引擎，支持 GB28181/RTSP/RTMP → HLS/FLV/WebRTC 转封装 |
| **视频信令** | 自研 SIP Server (基于 JAIN-SIP / Netty) | GB/T 28181 设备注册、点播、PTZ 控制 |
| **消息总线** | Apache Kafka 3.x (KRaft) | 高吞吐、持久化、生态丰富；无 ZooKeeper 依赖，运维简化 |
| **关系数据库** | PostgreSQL 16 + TimescaleDB | 最强开源关系库 + 时序扩展 |
| **缓存** | Redis 7 Cluster | 万金油缓存 + 数据结构 |
| **对象存储** | MinIO | S3 兼容、自托管 |
| **搜索引擎** | Elasticsearch 8 | 全文搜索 + 日志 |
| **容器编排** | Kubernetes | 行业标准 |
| **CI/CD** | GitHub Actions / GitLab CI | 主流 CI/CD |
| **IaC** | Terraform + Helm | 基础设施即代码 |
| **观测** | Prometheus + Grafana + OpenTelemetry | 云原生观测标准 |
| **API 网关** | Spring Cloud Gateway | 与 Spring Cloud Alibaba 无缝集成，支持 Sentinel 限流、Nacos 动态路由 |

---

## 17. 项目里程碑

| 阶段 | 时间 | 目标 | 交付物 |
|------|------|------|--------|
| **M1: 基础架构** | W1-W4 | 项目脚手架、CI/CD、基础设施 | 代码框架、Docker Compose、Helm Chart |
| **M2: 核心接入** | W5-W10 | MQTT/HTTP 接入、设备管理、物模型 | 设备 CRUD、MQTT 连接、属性上报 |
| **M3: 多租户** | W11-W14 | 租户体系、RBAC、数据隔离 | 多租户控制台、权限管理 |
| **M4: 规则引擎** | W15-W18 | 规则引擎、告警、数据存储 | 规则 SQL、Webhook、时序存储 |
| **M5: 跨租户共享** | W19-W22 | 共享策略、数据脱敏、审计日志 | 共享 API、脱敏引擎、审计报告 |
| **M6: 扩展协议** | W23-W26 | CoAP/LwM2M/WebSocket 支持 | 多协议适配器 |
| **M7: 高级功能** | W27-W30 | OTA、设备影子、数据分析 | OTA 升级、影子服务 |
| **M8: 性能优化** | W31-W34 | 百万设备压测、性能调优 | 压测报告、调优方案 |
| **M9: GA 发布** | W35-W38 | 文档完善、安全审计、正式发布 | v1.0 GA |

---

## 18. 附录

### 18.1 术语表

| 术语 | 说明 |
|------|------|
| **Product (产品)** | 同一类设备的抽象，定义物模型和接入方式 |
| **Device (设备)** | 产品的实例，唯一标识为 `{productKey}/{deviceName}` |
| **Thing Model (物模型)** | 设备能力的数字化描述：属性、事件、服务 |
| **Device Shadow (设备影子)** | 设备状态的云端镜像，支持离线指令缓存 |
| **Tenant (租户)** | 平台的独立使用者组织，拥有隔离的资源空间 |
| **Rule (规则)** | 基于 SQL 的数据筛选 + 转换 + 动作触发逻辑 |
| **OTA** | Over-The-Air，设备空中固件升级 |
| **SAS Token** | Shared Access Signature，限时访问令牌 |
| **SharePolicy (共享策略)** | 控制跨租户数据共享的策略实体，定义共享范围、权限、脱敏规则、有效期 |
| **Access Token** | 短效访问令牌 (JWT)，携带用户/租户/角色信息，默认有效期 2h |
| **Refresh Token** | 长效刷新令牌，用于无感续签 Access Token，默认有效期 30d |

### 18.2 参考架构对比

| 特性 | Firefly-IoT | AWS IoT Core | Azure IoT Hub | EMQX Platform |
|------|-------------|-------------|---------------|---------------|
| 开源 | ✅ | ❌ | ❌ | 部分 |
| 私有化部署 | ✅ | ❌ | ❌ | ✅ |
| 多租户 | ✅ 原生 | ❌ (需自建) | ❌ (需自建) | ❌ |
| 多协议 | ✅ 可扩展 | MQTT/HTTP | MQTT/AMQP/HTTP | MQTT 为主 |
| 规则引擎 | ✅ SQL+DAG | ✅ SQL | ✅ 流分析 | ✅ SQL |
| 设备影子 | ✅ | ✅ | ✅ Device Twin | ❌ |
| 物模型 | ✅ | ✅ | ✅ DTDL | ❌ |
| 跨租户共享 | ✅ 原生 (策略+脱敏+审计) | ✖ | ✖ | ✖ |
| 多平台登录 | ✅ Web/APP/小程序 + 第三方登录 | ✖ (仅 Web) | ✖ (仅 Web) | ✖ |
| 最低成本 | 免费 (自托管) | 按量付费 | 按量付费 | 按连接数 |

### 18.3 数据库 ER 概要

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   tenants    │     │   products   │     │   devices    │
├──────────────┤     ├──────────────┤     ├──────────────┤
│ id (PK)      │◄──┐ │ id (PK)      │◄──┐ │ id (PK)      │
│ name         │   │ │ tenant_id(FK)│───┘ │ tenant_id(FK)│
│ status       │   │ │ product_key  │     │ product_id(FK)│
│ quota_config │   │ │ name         │     │ device_name  │
│ created_at   │   │ │ thing_model  │     │ device_secret│
│ updated_at   │   │ │ description  │     │ status       │
└──────────────┘   │ │ protocol     │     │ online_status│
                   │ │ created_at   │     │ last_online  │
┌────────────────┐   │ └──────────────┘     │ tags (JSONB) │
│    users       │   │                      │ created_at   │
├────────────────┤   │ ┌──────────────┐     └──────────────┘
│ id (PK)        │   │ │    rules     │
│ tenant_id(FK)  │───┘ ├──────────────┤     ┌──────────────┐
│ username       │     │ id (PK)      │     │device_shadows│
│ password_hash  │     │ tenant_id(FK)│     ├──────────────┤
│ phone          │     │ name         │     │ device_id(PK)│
│ email          │     │ sql_expr     │     │ tenant_id    │
│ avatar_url     │     │ actions(JSON)│     │ desired(JSON)│
│ role_id (FK)   │     │ enabled      │     │ reported(JSON│
│ status         │     │ created_at   │     │ version      │
│ created_at     │     └──────────────┘     │ updated_at   │
└──────┬─────────┘                          └──────────────┘
       │
       │  ┌────────────────────┐
       ├─►│  user_sessions     │
       │  ├────────────────────┤
       │  │ id (PK)            │
       │  │ user_id (FK)       │
       │  │ platform           │  (WEB/APP_IOS/APP_ANDROID/MINI_WECHAT)
       │  │ device_fingerprint │
       │  │ login_method       │
       │  │ login_ip           │
       │  │ access_token       │
       │  │ refresh_token      │
       │  │ push_token         │
       │  │ expires_at         │
       │  │ created_at         │
       │  └────────────────────┘
       │
       │  ┌────────────────────┐
       └─►│ user_oauth_bindings│
          ├────────────────────┤
          │ id (PK)            │
          │ user_id (FK)       │
          │ provider           │  (WECHAT/ALIPAY/APPLE/DINGTALK)
          │ open_id            │
          │ union_id           │
          │ nickname           │
          │ avatar_url         │
          │ created_at         │
          └────────────────────┘

┌──────────────┐
│    roles     │                          ┌──────────────────┐
├──────────────┤                          │device_telemetry  │
│ id (PK)      │                          ├──────────────────┤
│ tenant_id(FK)│                          │ ts (PK, 时间)    │
│ name         │                          │ tenant_id        │
│ permissions  │                          │ device_id        │
│ (JSONB)      │                          │ property         │
└──────────────┘                          │ value (DOUBLE)   │
                                           │ value_str (TEXT) │
                                           └──────────────────┘

┌────────────────────┐     ┌────────────────────┐
│  share_policies    │     │  share_audit_logs  │
├────────────────────┤     ├────────────────────┤
│ id (PK)            │◄──┐ │ id (PK)            │
│ owner_tenant_id(FK)│   │ │ policy_id (FK)     │───┘
│ consumer_tenant_id │   │ │ action             │
│ scope (JSONB)      │   │ │ query_detail(JSONB)│
│ data_permissions   │   │ │ created_at         │
│ masking_rules      │   │ └────────────────────┘
│ status             │   │
│ validity (JSONB)   │   │ ┌────────────────────┐
│ created_at         │   │ │share_subscriptions │
└────────────────────┘   │ ├────────────────────┤
                        │ │ id (PK)            │
                        └─│ policy_id (FK)     │
                          │ kafka_topic        │
                          │ status             │
                          └────────────────────┘
```

---

> **文档维护**: 本文档随项目迭代持续更新，最新版本请以仓库 `docs/design/product-design.md` 为准。
