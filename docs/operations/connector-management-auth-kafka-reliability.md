# Connector 管理面鉴权与 Kafka 重试/死信 运维说明

> **模块**: firefly-connector、firefly-gateway、firefly-common、firefly-rule、firefly-system、firefly-device
> **版本**: v1.0.0

---

## 1. 部署变化

- Connector 9070 不再映射到宿主机；管理接口与设备 HTTP 统一经网关 `8080` 访问。
- 设备侧接入地址变化（破坏性）：
  - 旧：`http://<connector-host>:9070/api/v1/protocol/http/...`
  - 新：`http://<gateway-host>:8080/CONNECTOR/api/v1/protocol/http/...`
- MQTT 1883、CoAP 5683/udp 保持宿主机映射。

## 2. 配置项

| 配置 | 环境变量 | 默认 | 说明 |
| --- | --- | --- | --- |
| `firefly.mqtt.webhook-token` | `FIREFLY_MQTT_WEBHOOK_TOKEN` | 空 | 外部 Broker 回调令牌，配置后必须携带 `X-Webhook-Token` |
| `firefly.lorawan.webhook-token` | `FIREFLY_LORAWAN_WEBHOOK_TOKEN` | 空 | LoRaWAN 回调令牌 |
| `firefly.kafka.consumer.retry-max-attempts` | `FIREFLY_KAFKA_CONSUMER_RETRY_MAX_ATTEMPTS` | 3 | 消费失败重试次数（不含首次） |
| `firefly.kafka.consumer.retry-interval-ms` | `FIREFLY_KAFKA_CONSUMER_RETRY_INTERVAL_MS` | 1000 | 重试间隔 |

> 生产环境必须配置两个 webhook 令牌；否则任意来源可伪造设备上行。

## 3. 鉴权行为

- Connector 管理接口（modbus/snmp/tcp-udp/websocket/lorawan 管理）必须携带有效 JWT；无 Token 返回 401。
- 设备侧 webhook 配置令牌后，未携带或不匹配返回 403。
- 网关白名单只放行设备侧路径；管理路径仍走 JWT 校验。

## 4. 死信 topic

消费失败重试耗尽后，`DeadLetterPublishingRecoverer` 把记录投递到 `<原 topic>.dlt`。
死信 topic 与业务 topic 一一对应，完整清单以
[`deploy/kafka/init-topics.sh`](../../deploy/kafka/init-topics.sh) 为准（预建脚本会同时创建业务 topic 与 `.dlt`）。

| 来源 | 业务 topic（死信为同名的 `.dlt`） |
| --- | --- |
| 设备上行/下行 | `device.message.up`、`device.message.down`、`device.property.report`、`device.event.report`、`device.lifecycle`、`device.service.invoke`、`device.ota.progress` |
| 规则/告警/流转 | `rule.engine.input`、`alarm.trigger`、`share.data.forward`、`platform.event` |
| 平台领域事件 | `firefly.tenant.events`、`firefly.user.events`、`firefly.role.events`、`firefly.permission.events`、`firefly.auth.events`、`firefly.session.events`、`firefly.audit.events`、`firefly.api.access.logs` |
| 协议/视频运行时 | `protocol.parser.changed`、`video.device.status.changed`、`video.channels.synced`、`video.device.info.synced` |

- 生产环境建议用 `kafka-init` 预建 topic 与 `.dlt`（见下方“Kafka 可靠性配置”），不要依赖 broker 自动创建。
- 建议为 DLT 积压配置监控告警，并提供重投工具（消费 DLT 后重新投递原 topic）。

## 5. 故障排查

| 现象 | 排查 |
| --- | --- |
| 管理接口 401 | 确认请求经网关且携带 JWT；确认网关白名单未误放管理路径 |
| 设备 HTTP 接入 404 | 确认设备使用 `/CONNECTOR/api/v1/protocol/http/...` 且网关路由正常 |
| webhook 403 | 检查 `X-Webhook-Token` 与配置是否一致 |
| 下行 DLT 积压 | 设备离线/路由过期导致无在线通道；检查设备重连与路由心跳 |
| 消费持续重试 | 查看服务日志中的异常，修复后可从 DLT 重投 |

## 6. 回滚

- 回退 `firefly-connector` / `firefly-gateway` / `firefly-common` 及各业务服务镜像。
- 若需临时恢复 9070 公网访问，可在 Compose 重新加入 `"9070:9070"`，但不建议在生产使用。
- 死信 topic 与重试配置为运行期参数，回滚代码后仍保留。

---

## 规则转发失败传播（ACC-002）

- `DeviceMessageProducer` 发送方法返回 `CompletableFuture`，Kafka 异步发送失败不再只记日志。
- `MessageRouterService.forwardToRuleEngine` 等待发送结果（`firefly.kafka.rule-forward-timeout-ms`，默认 5000ms），失败抛出使消费进入重试/死信。
- 上行/下行其它链路保持异步发送，失败会记录日志；需要可靠投递的链路应等待 future。

---

# Kafka 可靠性配置

> **适用版本**: 2026-11 之后的部署配置
> **涉及服务**: firefly-device、firefly-system、firefly-rule、firefly-connector、firefly-support、firefly-media
> **涉及资产**: `deploy/.env.example`、`deploy/docker-compose.prod.yml`、`deploy/docker-compose.github.yml`、`deploy/docker-compose.kafka-ha.yml`、`deploy/kafka/init-topics.sh`

## 1. 生产端：acks、幂等与重试

各服务 `application.yml` 的 `spring.kafka.producer` 统一为：

| 配置 | 值 | 作用 |
| --- | --- | --- |
| `acks` | `all` | 等待 ISR 全部副本确认后才算发送成功，避免 leader 故障丢已确认消息 |
| `retries` | `10` | 可重试异常（网络抖动、leader 切换）自动重试 |
| `properties.enable.idempotence` | `true` | broker 按 producerId + 序列号去重，重试不会产生重复消息 |
| `properties.max.in.flight.requests.per.connection` | `5` | 幂等生产者的上限（超过会破坏单分区顺序），取允许的最大值兼顾吞吐 |
| `properties.delivery.timeout.ms` | `120000` | 单条消息从 `send()` 到最终失败的总超时（含重试排队），避免无限重试 |

生效范围：device、system、rule、connector、support、media。
`firefly-data` 不生产也不消费 Kafka（仅引入公共依赖），因此未新增 Kafka 配置，避免出现“配了但无人使用”的空配置。

注意事项：

- `acks=all` 的可靠性依赖 broker 副本数：单 broker（`replication-factor=1`）时只保证单机落盘；生产要 3 副本 + `min.insync.replicas=2`（见 HA 章节）。
- 幂等生产者只保证**单分区内**不重不丢；跨分区/业务级幂等仍需消费端按 `messageId` 去重（device 链路已实现）。
- `delivery.timeout.ms` 必须大于 `request.timeout.ms + linger.ms`，且要与业务可接受的发送阻塞时长匹配；如调整 `retries`，同步评估该值。

## 2. 消费端：并发、批量与提交语义

| 配置 | 值 | 说明 |
| --- | --- | --- |
| `spring.kafka.consumer.max-poll-records` | `200` | 单次 poll 最大记录数，控制单批处理耗时，避免一批过大导致后续 poll 超时 |
| `spring.kafka.consumer.properties.max.poll.interval.ms` | `300000` | 两次 poll 的最大间隔（5 分钟）；超时会被踢出消费组并触发再平衡 |
| `spring.kafka.listener.concurrency` | `${KAFKA_LISTENER_CONCURRENCY:2}` | 每个 `@KafkaListener` 的消费线程数，部署环境通过 `KAFKA_LISTENER_CONCURRENCY` 覆盖 |
| `spring.kafka.listener.ack-mode` | `record` | 单条记录处理成功后提交 offset；失败记录由统一 `DefaultErrorHandler` 重试，耗尽后进 `.dlt` |

调优建议：

- `concurrency` 建议不超过 topic 分区数；3 分区 topic 用 3 个线程即可吃满，盲目调大盘活线程只会增加再平衡成本。
- 若单条消息处理本身较慢（例如调用外部 HTTP），应先确认 `max.poll.interval.ms` 是否足够，而不是直接加线程。
- 消费失败重试次数/间隔仍由 `firefly.kafka.consumer.retry-max-attempts` / `retry-interval-ms`（环境变量 `FIREFLY_KAFKA_CONSUMER_RETRY_MAX_ATTEMPTS` / `FIREFLY_KAFKA_CONSUMER_RETRY_INTERVAL_MS`）控制，与本次新增参数互不影响。
- `ack-mode=record` 与统一 ErrorHandler 搭配使用；不要改成手动 ack 模式，除非同时修改消费者代码。

## 3. 预建 topic 与死信 topic

脚本：[`deploy/kafka/init-topics.sh`](../../deploy/kafka/init-topics.sh)

- 覆盖 `KafkaTopics`（11 个）与 `EventTopics`（12 个）全部 23 个业务 topic 常量，并为每个 topic 额外创建 `<topic>.dlt`，共 46 个 topic。
- 使用 `kafka-topics.sh --create --if-not-exists`，可重复执行；已存在的 topic 不会被修改分区/副本。
- 分区数取 `KAFKA_TOPIC_PARTITIONS`（默认 3），副本数取 `KAFKA_TOPIC_REPLICATION_FACTOR`（脚本默认 3，**单 broker 环境必须设为 1**）。
- 启动前会等待 broker 可用，并在能探测到 broker 数量时对副本数做预检（RF 大于 broker 数直接报错退出）。

使用方式（compose，单 broker 默认栈）：

```bash
cd deploy
# 一次性预建（--rm 执行完即退出；默认不会随 up -d 启动）
docker compose -f docker-compose.prod.yml --env-file .env --profile kafka-init run --rm kafka-init
# 或以常驻方式启动后自动退出
docker compose -f docker-compose.prod.yml --env-file .env --profile kafka-init up -d kafka-init
```

使用方式（宿主机有 Kafka 客户端时）：

```bash
KAFKA_BOOTSTRAP_SERVERS=localhost:9092 \
KAFKA_TOPIC_PARTITIONS=3 KAFKA_TOPIC_REPLICATION_FACTOR=1 \
bash deploy/kafka/init-topics.sh
```

说明：

- `kafka-init` 通过 `KAFKA_SERVERS` 变量连接集群；**HA 模式下务必确认 `.env` 的 `KAFKA_SERVERS` 已指向 HA 集群**，否则 topic 会建到单 broker 集群上。
- 脚本中的 topic 清单必须与 `firefly-common` 的 `KafkaTopics` / `EventTopics` 保持同步；新增 topic 常量时同步修改脚本，否则新 topic 只能依赖 broker 自动创建（分区/副本不可控）。
- 需要调整已存在 topic 的分区数时使用 `kafka-topics.sh --alter --topic <t> --partitions <n>`；副本数调整需走分区重分配工具，脚本不会自动改。

## 4. 3 broker HA overlay（KRaft）

文件：[`deploy/docker-compose.kafka-ha.yml`](../../deploy/docker-compose.kafka-ha.yml)

### 4.1 拓扑

| 项 | 值 |
| --- | --- |
| 模式 | KRaft combined（每节点同时是 controller + broker） |
| 节点 | kafka1(node 1)、kafka2(node 2)、kafka3(node 3) |
| 监听 | broker `PLAINTEXT://0.0.0.0:9092`，controller `CONTROLLER://0.0.0.0:9093` |
| advertised listeners | `kafka1:9092` / `kafka2:9092` / `kafka3:9092`（仅容器网络内可解析） |
| controller quorum | `1@kafka1:9093,2@kafka2:9093,3@kafka3:9093` |
| 镜像 | `apache/kafka:3.7.1`（与单 broker 保持一致） |
| 数据卷 | `kafka1_data` / `kafka2_data` / `kafka3_data`（compose 自动创建，名称 `firefly-kafka1-data` 等） |
| broker 可靠性参数 | `KAFKA_MIN_INSYNC_REPLICAS=2`、`KAFKA_DEFAULT_REPLICATION_FACTOR=3`、offset/transaction topic 副本数 3 且 min ISR 2 |
| profile | `kafka-ha`（默认不启动） |

- 三个 broker 不向宿主机发布端口，避免与单 broker 的 9092 映射冲突；排障使用 `docker compose exec kafka1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --describe`。
- 所有 broker 共用同一 `CLUSTER_ID`；与 `docker-compose.prod.yml` 里的单 broker 集群是两套独立集群。
- 单 broker `kafka` 服务仍保留在 `docker-compose.prod.yml`，且被 java 服务的 `depends_on` 引用，HA 模式下仍会启动，但业务服务连接地址由 `KAFKA_SERVERS` 决定，数据面不使用它。该容器会额外占用内存，后续若要彻底移除需要调整 compose 依赖（本次未做）。

### 4.2 启用步骤

1. 修改 `deploy/.env`：

```bash
KAFKA_SERVERS=kafka1:9092,kafka2:9092,kafka3:9092
KAFKA_TOPIC_PARTITIONS=3
KAFKA_TOPIC_REPLICATION_FACTOR=3
KAFKA_LISTENER_CONCURRENCY=2
```

2. 先起 HA broker：

```bash
cd deploy
docker compose -f docker-compose.prod.yml -f docker-compose.kafka-ha.yml \
  --env-file .env --profile kafka-ha up -d kafka1 kafka2 kafka3
```

3. 预建 topic 与 `.dlt`（此时 `KAFKA_SERVERS` 已指向 HA 集群）：

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.kafka-ha.yml \
  --env-file .env --profile kafka-init run --rm kafka-init
```

4. 启动/更新业务服务：

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.kafka-ha.yml \
  --env-file .env --profile kafka-ha up -d
```

5. 验收：

```bash
# 确认 3 个 broker 均注册在集群内
docker compose -f docker-compose.prod.yml -f docker-compose.kafka-ha.yml \
  --env-file .env exec kafka1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --describe --topic device.message.up
# 期望：PartitionCount=3、ReplicationFactor=3，每个分区 Leader/Isr 均为 3 个副本
```

### 4.3 副本数（RF）说明

- HA 集群必须 `KAFKA_TOPIC_REPLICATION_FACTOR=3`：3 副本可容忍 1 个 broker 故障；配合 `acks=all` + `min.insync.replicas=2`，任意 1 个 broker 宕机仍可写入。
- 不要用 RF=2 做“折中”：新增 broker 会改变副本分布限制，且 2 副本在维护窗口下没有冗余。
- 单 broker 环境必须 RF=1（`.env.example` 默认值）；否则预建脚本会因“副本数大于 broker 数”直接失败。
- 已有 topic 的副本数不会因修改 `.env` 自动变化，需要分区重分配。

## 5. 镜像版本固定（部署资产）

| 服务 | 原配置 | 现配置 | 说明 |
| --- | --- | --- | --- |
| PostgreSQL/TimescaleDB | `timescale/timescaledb:latest-pg16` | `timescale/timescaledb:2.32.0-pg16` | 固定 TimescaleDB 扩展版本，避免 `latest` 漂移；PG16 大版本不变 |
| MinIO | `minio/minio:latest` | `minio/minio:RELEASE.2025-09-07T16-13-09Z` | 固定到最后一个多架构社区版本；功能配置（环境变量、命令、健康检查）未改 |
| Kafka | `apache/kafka:3.7.1` | 保持不变 | 原本已是固定版本，HA overlay 沿用同一版本 |

风险与处理：

- **TimescaleDB**：若存量数据卷由其它 TimescaleDB 版本初始化，需按扩展升级流程处理（`ALTER EXTENSION timescaledb UPDATE;`），并先备份。升级/降级镜像前务必确认 `SELECT extversion FROM pg_extension WHERE extname='timescaledb';`。
- **MinIO**：2026 年 Docker Hub 已下线 `minio/minio` 仓库，若所在环境无法拉取该 tag，请从可用的镜像仓库/内部镜像源同步 `RELEASE.2025-09-07T16-13-09Z`（或 `quay.io/minio/minio` 官方替代地址）后再部署；本次未改变 MinIO 的启动命令、环境变量与健康检查。
- 应用服务镜像由 `APP_IMAGE_TAG` 决定（release 部署必须显式传 `APP_IMAGE_TAG=vX.Y.Z`，不要依赖 `latest`）。

## 6. 变更后验证（发布前/上线时）

1. YAML 语法：`ruby -ryaml -e "YAML.load_file('firefly-device/src/main/resources/application.yml')"`（或等价工具）。
2. Compose 渲染（不需要启动容器）：

```bash
cd deploy
docker compose -f docker-compose.prod.yml --env-file .env config >/dev/null
docker compose -f docker-compose.prod.yml -f docker-compose.kafka-ha.yml --env-file .env --profile kafka-ha config >/dev/null
docker compose -f docker-compose.prod.yml --env-file .env --profile kafka-init config >/dev/null
```

3. 运行期确认生产端参数生效：开启 DEBUG 日志后观察 `ProducerConfig` 中的 `acks`、`enable.idempotence`、`delivery.timeout.ms`；或通过 broker 侧监控确认 `Produce` 请求的 acks=all。
4. 运行期确认消费端：`kafka-consumer-groups.sh --describe` 查看分区分配与 lag；确认主题分区的消费者线程数与 `KAFKA_LISTENER_CONCURRENCY` 一致。
5. 故障演练（预发环境）：停掉 1 个 broker，确认生产仍成功、消费 lag 可恢复；停掉 2 个 broker，确认写入失败（符合预期）而不是静默丢消息。

## 7. 故障排查

| 现象 | 排查方向 |
| --- | --- |
| 启动日志提示 `Topic(s) [xxx] is/are not present` | 未执行 kafka-init，或 `KAFKA_SERVERS` 指向错误集群；先按第 3 节预建 |
| `InvalidReplicationFactorException` | 单 broker 用了 RF>1；把 `.env` 的 `KAFKA_TOPIC_REPLICATION_FACTOR` 改为 1 |
| HA 集群只有一个 broker 可用 | 检查三个容器的 `KAFKA_CONTROLLER_QUORUM_VOTERS`、`CLUSTER_ID` 是否一致，网络 `firefly-net` 是否互通 |
| 消费反复 rebalance | 检查单条处理耗时是否超过 `max.poll.interval.ms`；或并发线程数超过分区数 |
| 生产发送超时 | 检查 broker 是否少于 `min.insync.replicas`；确认 `acks=all` 下 ISR 是否充足 |
| DLT 积压 | 定位对应业务异常并修复；确认 `<topic>.dlt` 已预建；暂无内置重投工具，可手工消费 DLT 后重投 |

## 8. 回滚

- 配置回滚：把各服务 `application.yml` 的 `spring.kafka` 段恢复为旧值并重建镜像/重启服务；仅改配置时无需迁移数据。
- HA 回滚：停止 `--profile kafka-ha` 的 3 个 broker，把 `.env` 的 `KAFKA_SERVERS` 改回 `kafka:9092` 后重建业务服务；单 broker 集群数据仍在原 `kafka_data` 卷中。
- 预建 topic 不需要删除；回滚到单 broker 时若 topic 为 RF=3，单 broker 无法满足 ISR，需要把相关 topic 副本数重分配为 1 或重建集群（预发/生产回滚前请评估）。
- 镜像回滚：恢复为回滚前镜像 tag；TimescaleDB 降级镜像需先确认扩展版本兼容（不建议跨大版本降级）。

## 9. 未在本次验证范围内的项

- 未在本机执行 Maven 构建/单元测试，未连接真实 Kafka 验证参数实际生效。
- HA overlay 的 3 broker 选举、broker 故障演练未在真实 Docker 环境执行（本机无 Docker daemon），只做了 `docker compose config` 渲染校验。
- 镜像 tag 的可拉取性需在目标环境确认（尤其 MinIO，见第 5 节）。
- `docs/operations/telemetry-governance-operations.md` 与 `docs/design/detailed-design-telemetry-governance.md` 仍引用 `timescaledb:latest-pg16` 的旧描述，属于其它文档的后续同步项。
