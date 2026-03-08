# Firefly IoT

Firefly IoT 是一个面向多租户场景的设备接入与管理平台，采用 Spring Boot + Spring Cloud Alibaba + PostgreSQL + Redis + Kafka 的微服务架构。当前 MQTT 接入已经收敛到 `firefly-connector` 内置 Broker，不再依赖独立 EMQX 服务。

## 技术栈

| 层次 | 技术 |
| --- | --- |
| 后端 | Java 21, Spring Boot 3.3, Spring Cloud Alibaba 2023 |
| 网关 | Spring Cloud Gateway, Sentinel |
| 数据库 | PostgreSQL 16, TimescaleDB |
| 缓存 | Redis 7 |
| 消息 | Apache Kafka 3.x |
| 注册配置 | Nacos 2.x |
| 对象存储 | MinIO |
| 前端 | React 18, TypeScript, Ant Design 5, Vite |
| 部署 | Docker Compose |

## 项目结构

```text
firefly-iot/
├─ firefly-common/       # 公共基础能力
├─ firefly-api/          # Feign 契约与共享 DTO
├─ firefly-system/       # 租户、用户、权限、认证、菜单配置
├─ firefly-device/       # 产品、设备、物模型、影子、OTA
├─ firefly-rule/         # 规则引擎、告警
├─ firefly-media/        # 视频监控、GB28181、ZLMediaKit 集成
├─ firefly-data/         # 监控、分析、仪表盘
├─ firefly-support/      # 文件、通知、导出
├─ firefly-connector/    # 协议接入层，内置 MQTT Broker
├─ firefly-gateway/      # API 网关
├─ firefly-web/          # Web 前端
└─ deploy/               # Docker Compose、Dockerfile、部署脚本
```

## 快速开始

### 1. 启动基础设施

```bash
docker compose -f deploy/docker-compose.yml up -d
```

这会启动 PostgreSQL、Redis、Kafka、Nacos、MinIO、Sentinel。

如果本地也想用容器跑 `firefly-connector` 并直接暴露 MQTT 1883，可以额外执行：

```bash
mvn -pl firefly-connector -am -DskipTests package
docker compose -f deploy/docker-compose.yml --profile connector up -d connector
```

### 2. 启动后端服务

```bash
mvn clean install -DskipTests

cd firefly-system && mvn spring-boot:run
cd firefly-device && mvn spring-boot:run
cd firefly-rule && mvn spring-boot:run
cd firefly-support && mvn spring-boot:run
cd firefly-connector && mvn spring-boot:run
cd firefly-gateway && mvn spring-boot:run
```

`firefly-connector` 本地启动后会默认监听：

- HTTP: `9070`
- MQTT: `1883`
- CoAP: `5683/udp`

### 3. 启动前端

```bash
cd firefly-web
npm install
npm run dev
```

默认访问地址为 [http://localhost:3000](http://localhost:3000)。

## 服务与端口

| 服务 | 端口 | 说明 |
| --- | --- | --- |
| firefly-gateway | 8080 | API 网关入口 |
| firefly-system | 8081 | 系统与认证服务 |
| firefly-device | 9020 | 产品、设备、物模型 |
| firefly-rule | 9030 | 规则引擎 |
| firefly-media | 9040 | 视频监控 |
| firefly-data | 9050 | 监控分析 |
| firefly-support | 9060 | 文件、通知、导出 |
| firefly-connector | 9070 | 协议接入 HTTP 管理接口 |
| firefly-connector MQTT | 1883 | 设备 MQTT 接入端口 |
| firefly-connector CoAP | 5683/udp | CoAP 接入端口 |
| firefly-web | 3000 | 前端开发服务 |

## MQTT 接入说明

### 当前实现

- `firefly-connector` 内置 Moquette Broker，设备直接连接 `connector` 的 `1883`。
- 设备上行消息经 `firefly-connector` 解析后写入 Kafka，再由 `firefly-device` 消费。
- 设备下行消息由 `firefly-device` 写入 Kafka `device.message.down`，再由 `firefly-connector` 共享消费组消费并投递到目标连接。
- 多实例场景下，连接路由与节点心跳存于 Redis；如果下行消息被非所属节点消费，会通过 Redis Pub/Sub 转发给实际持有连接的节点。

### 认证与注册

- 一机一密产品：设备直接使用设备三元组认证连接。
- 一型一密产品：设备先调用动态注册接口换取设备密钥，再按一机一密建立 MQTT 连接。
- 动态注册接口：`/CONNECTOR/api/v1/protocol/device/register`

### 兼容入口

`firefly-connector` 仍保留 `/CONNECTOR/api/v1/protocol/mqtt/*` Webhook 接口，用于兼容外部 MQTT Broker 的 `auth`、`acl`、`message`、`disconnect` 回调，但内置 Broker 已是默认实现。

## Docker 部署

### 一键部署

```bash
cd deploy
cp .env.example .env
bash deploy.sh up
```

部署完成后默认可访问：

- 前端: [http://localhost](http://localhost)
- Gateway API: [http://localhost:8080](http://localhost:8080)
- Connector HTTP: [http://localhost:9070](http://localhost:9070)
- MQTT: `mqtt://localhost:1883`
- CoAP: `coap://localhost:5683`
- Nacos: [http://localhost:8848/nacos](http://localhost:8848/nacos)
- MinIO: [http://localhost:9001](http://localhost:9001)
- Sentinel: [http://localhost:8858](http://localhost:8858)

### 关键 MQTT 环境变量

完整变量请查看 [deploy/.env.example](deploy/.env.example)。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `FIREFLY_MQTT_ENABLED` | `true` | 是否启用内置 MQTT Broker |
| `FIREFLY_MQTT_HOST` | `0.0.0.0` | Broker 监听地址 |
| `FIREFLY_MQTT_PORT` | `1883` | Broker 监听端口 |
| `FIREFLY_MQTT_ALLOW_ANONYMOUS` | `false` | 是否允许匿名连接 |
| `FIREFLY_MQTT_PERSISTENCE_ENABLED` | `false` | 是否启用持久化会话/消息存储 |
| `FIREFLY_MQTT_DATA_PATH` | `data/mqtt` | MQTT 数据目录 |
| `FIREFLY_MQTT_MAX_MESSAGE_SIZE` | `65536` | 最大消息字节数 |
| `FIREFLY_MQTT_NODE_ID` | 空 | 节点标识，留空时自动使用 `POD_NAME/HOSTNAME/HOST + port` 生成 |
| `FIREFLY_MQTT_DOWNSTREAM_GROUP` | 空 | Kafka 下行共享消费组，留空时自动生成 |
| `FIREFLY_MQTT_ROUTE_TTL_SECONDS` | `120` | 设备连接路由 TTL |
| `FIREFLY_MQTT_ROUTE_REFRESH_INTERVAL_SECONDS` | `30` | 路由刷新周期 |
| `FIREFLY_MQTT_NODE_HEARTBEAT_TTL_SECONDS` | `45` | 节点心跳 TTL |
| `FIREFLY_MQTT_NODE_HEARTBEAT_INTERVAL_SECONDS` | `15` | 节点心跳刷新周期 |
| `FIREFLY_MQTT_DOWNSTREAM_QOS` | `1` | 下行投递 QoS |
| `FIREFLY_MQTT_RELAY_CHANNEL_PREFIX` | `connector:mqtt:downstream:` | Redis 转发通道前缀 |

### 水平扩容说明

- 当前 `deploy/docker-compose.prod.yml` 默认提供单实例 `connector`，适合单机部署。
- 如果要做 `connector` 多实例，请将外部 MQTT 入口放到四层负载均衡或 Ingress TCP 入口前面，不要让多个副本在同一宿主机直接抢占同一个宿主端口 `1883`。
- 多实例场景下务必保证各节点 `FIREFLY_MQTT_NODE_ID` 唯一；不配置时会优先使用 `POD_NAME`、`HOSTNAME` 或 `HOST` 自动生成，适合 Docker/Kubernetes 容器环境。

## 文档

- [架构文档](ARCHITECTURE.md)
- [产品设计](docs/product-design.md)
- [用户权限详细设计](docs/detailed-design-user-permissions.md)
- [租户管理详细设计](docs/detailed-design-tenant-management.md)
- [设备管理详细设计](docs/detailed-design-device-management.md)
