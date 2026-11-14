# Kafka 生产/消费可靠性与 HA 拓扑设计方案

> **版本**: v1.0.0
> **日期**: 2026-11-15
> **模块**: 全部 Java 服务（device/system/rule/connector/support/media）、firefly-common、deploy 部署资产

---

## 1. 背景

第二轮商用就绪度审计（P1-19、P2-08、AUD-013）指出当前 Kafka 使用存在以下问题：

1. 各服务 `application.yml` 的 `spring.kafka.bootstrap-servers` 硬编码为共享开发机 IP `192.168.123.102:9092`，无法通过环境变量部署到其它环境。
2. 生产端未显式配置 `acks`、重试与幂等，默认 `acks=1` 时 leader 故障可能丢消息；未设置发送总超时，极端情况下发送线程长时间阻塞。
3. 消费端未限制单批条数与 poll 间隔，单条处理变慢时容易触发再平衡；`concurrency` 未外部化，无法按分区数调整。
4. 业务 topic 与 `<topic>.dlt` 依赖 broker 自动创建，分区数/副本数不可控，生产集群 RF 无法保证。
5. 部署只有单 broker，无法容忍 broker 故障；基础设施镜像仍使用 `latest`（TimescaleDB、MinIO），版本漂移不可复现。

## 2. 目标

1. Kafka 连接地址全部环境变量化，dev/prod/compose 使用不同地址不需要改配置。
2. 生产端达到"单分区内不丢不重"：`acks=all` + 幂等生产者 + 有限重试 + 发送总超时。
3. 消费端具备可控并发与可预期的 offset 提交语义，失败仍走统一"有限重试 + `.dlt`"策略。
4. 提供可重复执行的 topic 预建脚本，覆盖 `KafkaTopics` / `EventTopics` 全部常量与死信 topic。
5. 提供 3 broker KRaft HA overlay，RF=3 + `min.insync.replicas=2`，容忍单 broker 故障。
6. 固定基础设施镜像版本，消除 `latest` 带来的不可复现。

## 3. 非目标

- 不修改任何 Java 业务代码与 `firefly-common` 的 topic 常量（本次只改配置与部署资产）。
- 不引入 Kafka 事务性生产（`transactional.id`）；跨 topic 原子写不在本次范围。
- 不实现 DLT 重投工具（仍依赖人工/后续工具消费 `.dlt` 后重投）。
- 不改动 `firefly-data` 的 Kafka 配置（该服务当前不生产也不消费 Kafka）。

## 4. 配置设计

### 4.1 连接地址

各服务 `application.yml`：

```yaml
spring:
  kafka:
    bootstrap-servers: ${SPRING_KAFKA_BOOTSTRAP_SERVERS:localhost:9092}
```

- 本地开发不设置环境变量时连本机 `localhost:9092`，不再默认指向共享开发机。
- compose 统一通过 `*java-env` 注入 `SPRING_KAFKA_BOOTSTRAP_SERVERS=${KAFKA_SERVERS:-kafka:9092}`；HA 模式下 `KAFKA_SERVERS` 指向 `kafka1:9092,kafka2:9092,kafka3:9092`。
- `application-prod.yml` 原本已使用同名环境变量，无需重复修改。

### 4.2 生产端

| 配置 | 值 | 设计理由 |
| --- | --- | --- |
| `producer.acks` | `all` | 需要 ISR 全部副本确认；配合 RF=3 + min ISR=2 可容忍单 broker 故障 |
| `producer.retries` | `10` | 覆盖网络抖动/leader 切换；配合幂等避免重试重复 |
| `producer.properties.enable.idempotence` | `true` | broker 端按 producerId + epoch + 序列号去重 |
| `producer.properties.max.in.flight.requests.per.connection` | `5` | 幂等 producer 允许上限；取 5 兼顾吞吐，超过会破坏单分区顺序 |
| `producer.properties.delivery.timeout.ms` | `120000` | 发送调用总的失败边界，避免业务线程无限等待 |

`delivery.timeout.ms` 约束推导：`delivery.timeout.ms >= linger.ms + request.timeout.ms`；默认 `linger.ms=0`、`request.timeout.ms=30000`，120000 满足约束，同时覆盖 10 次重试的排队时间。

### 4.3 消费端

| 配置 | 值 | 设计理由 |
| --- | --- | --- |
| `consumer.max-poll-records` | `200` | 限制单批处理量；与 300s poll 间隔配合避免再平衡 |
| `consumer.properties.max.poll.interval.ms` | `300000` | 给单批处理留足时间；超时会被踢出组 |
| `listener.concurrency` | `${KAFKA_LISTENER_CONCURRENCY:2}` | 外部化并发；建议不超过 topic 分区数 |
| `listener.ack-mode` | `record` | 逐条提交 offset，失败记录重试/进 DLT，不影响同批已成功记录 |

`ack-mode=record` 与既有 `KafkaConsumerErrorConfig`（`DefaultErrorHandler` + `DeadLetterPublishingRecoverer`）组合后语义为：

1. 记录处理成功 → 立即提交 offset。
2. 记录处理抛出异常 → 按 `firefly.kafka.consumer.retry-max-attempts` 重试 → 耗尽后投递 `<topic>.dlt`，然后提交 offset 继续消费。

### 4.4 生效范围

| 服务 | 是否使用 Kafka | 本次处理 |
| --- | --- | --- |
| firefly-device | 生产 + 消费 | 环境变量 + 生产/消费/监听参数 |
| firefly-system | 生产 + 消费 | 同上 |
| firefly-rule | 生产 + 消费 | 同上 |
| firefly-connector | 生产 + 消费（@KafkaListener 注解指定 groupId） | 同上，新增 consumer/listener 段 |
| firefly-support | 仅配置、当前无 Kafka 生产者/消费者 | 保留配置并补齐参数（启用消费者后直接生效） |
| firefly-media | 生产（`KafkaEventPublisher` 发布视频领域事件） | 环境变量 + 生产参数；consumer/listener 作为统一模板保留 |
| firefly-data | 不使用 | 不新增 kafka 段 |
| firefly-gateway | 不使用 | 不新增 kafka 段 |

## 5. Topic 预建设计

脚本：`deploy/kafka/init-topics.sh`，由 compose 的 `kafka-init` 服务（`profiles: ["kafka-init"]`）执行。

- **覆盖范围**：`KafkaTopics` 11 个 + `EventTopics` 12 个 = 23 个业务 topic；每个再建 `<topic>.dlt`，共 46 个。
- **同步策略**：topic 常量在 Java 侧集中定义，脚本采用静态清单 + 注释指明同步来源。选择静态清单而非运行时解析 Java 源码，原因是脚本运行在 `apache/kafka` 镜像内，没有源码与 JDK；由开发规范（新增 topic 常量时同步脚本）保证一致，评审时核对。
- **幂等**：`--create --if-not-exists`，重复执行安全；已存在 topic 的分区/副本不会被静默修改。
- **安全阀**：等待 broker 可用；能探测到 broker 数量时校验 `RF <= broker 数`，避免在单 broker 上误用默认 RF=3 导致 46 个 topic 逐个失败。
- **默认值**：分区数 `${KAFKA_TOPIC_PARTITIONS:-3}`，副本数 `${KAFKA_TOPIC_REPLICATION_FACTOR:-3}`；`.env.example` 单 broker 默认 RF=1，HA 场景改为 3。

## 6. HA 拓扑设计

文件：`deploy/docker-compose.kafka-ha.yml`（overlay，profile `kafka-ha`）。

| 维度 | 设计 |
| --- | --- |
| KRaft 模式 | combined：每节点同时承担 controller + broker，3 节点即可满足 quorum（2/3 可用） |
| 节点 id | 1/2/3，容器 `firefly-kafka1/2/3` |
| 监听 | broker 9092 / controller 9093 |
| advertised listeners | `kafka1:9092`、`kafka2:9092`、`kafka3:9092`（容器网络内解析） |
| controller quorum | `1@kafka1:9093,2@kafka2:9093,3@kafka3:9093` |
| CLUSTER_ID | 三个节点一致，与单 broker 集群不同集群 |
| broker 可靠性 | `KAFKA_MIN_INSYNC_REPLICAS=2`、offset/transaction topic RF=3 min ISR=2、`KAFKA_DEFAULT_REPLICATION_FACTOR=3` |
| 数据卷 | `kafka1_data` / `kafka2_data` / `kafka3_data`（compose 管理，非 external） |
| 宿主端口 | 不发布，避免与单 broker 的 9092 冲突 |
| 启动方式 | 必须显式 `--profile kafka-ha`；初始化顺序：broker → kafka-init → 业务服务 |

### 6.1 为什么用 overlay + profile，而不是覆盖原 `kafka` 服务

- Compose 不支持"删除"服务：若在 overlay 里给原 `kafka` 加 profile，则所有声明了 `depends_on: kafka` 的 java 服务在未启用该 profile 时会直接报 `depends on undefined service`（已用 `docker compose config` 验证），会破坏单 broker 默认部署。
- 保留原 `kafka` 服务 + 新增 `kafka1/2/3`（profile `kafka-ha`）可以同时保证：
  - 不启用 profile 时，compose 模型与现状完全一致；
  - 启用 `kafka-ha` 时，数据面使用 3 broker 集群（`KAFKA_SERVERS` 注入），原单 broker 容器仍会因 `depends_on` 启动但不承载业务流量。
- 代价：HA 模式会多运行一个不参与数据面的单 broker 容器（约 256~512MB）。彻底移除需要调整各 java 服务的 `depends_on`，本次不做，列入后续优化。

### 6.2 RF 语义

- `replication-factor=3` + `acks=all` + `min.insync.replicas=2`：任 1 个 broker 故障仍可写入（ISR>=2），任 1 个 broker 故障不丢已确认消息。
- `replication-factor=1`：单机落盘，broker 故障即不可用且可能丢消息，仅用于开发。
- 已存在的 topic 不会因改 `.env` 自动变副本数，需要重新分配分区（脚本只创建不修改）。

## 7. 部署资产固定

| 资产 | 原值 | 新值 | 取舍 |
| --- | --- | --- | --- |
| TimescaleDB 镜像 | `timescale/timescaledb:latest-pg16` | `timescale/timescaledb:2.32.0-pg16` | 固定扩展版本，PG16 不变；避免行为漂移；存量库跨版本需按扩展升级流程处理 |
| MinIO 镜像 | `minio/minio:latest` | `minio/minio:RELEASE.2025-09-07T16-13-09Z` | 固定到社区版最后一个多架构发布；不改功能配置；Docker Hub 仓库下线属外部风险，文档已给出替代仓库处理方式 |
| Kafka 镜像 | `apache/kafka:3.7.1` | 不变 | 原本已固定，HA overlay 沿用 |

应用镜像仍由 `APP_IMAGE_TAG` 控制，release 部署要求显式传入发布版本，不使用 `latest` 作为发布标识。

## 8. 风险与取舍

1. **配置未在真实集群验证**：本次未执行 Maven 构建、未连接真实 Kafka；参数是否符合预期需要在预发环境用 broker 侧指标与 `kafka-consumer-groups.sh` 复核。
2. **幂等只覆盖单分区**：跨分区乱序/业务重复仍需业务侧幂等（device 已按 `messageId` 去重；rule/data-forward 等消费链路的业务幂等是既有遗留项）。
3. **HA 模式多一个未使用的单 broker**：见 6.1；仅消耗资源，不影响数据正确性。
4. **DLT 无自动重投**：失败消息进入 `<topic>.dlt` 后需人工或后续工具重投；本次只保证 DLT 已预建、可观测。
5. **MinIO 镜像可拉取性**：Docker Hub 社区镜像已下线，目标环境需镜像源/私有仓库同步；若无法获取，需替换为可用发行版并重新验证健康检查（`mc ready local`）。
6. **TimescaleDB 版本对齐**：存量数据卷的扩展版本可能低于/高于固定 tag，升级前需 `ALTER EXTENSION timescaledb UPDATE` 并备份；降级镜像存在兼容风险。
7. **topic 常量与脚本漂移**：脚本是静态清单，新增 topic 常量时若忘记同步，会回退到 broker 自动创建（分区/副本不可控）；代码评审需检查。

## 9. 验收标准

1. 各服务 `application.yml` 不再包含硬编码 `192.168.123.102` Kafka 地址；`SPRING_KAFKA_BOOTSTRAP_SERVERS` 可覆盖。
2. 六个服务的 `spring.kafka` 段包含生产/消费/监听可靠性参数，YAML 可正常解析。
3. `init-topics.sh` 覆盖两个常量类的全部 23 个 topic，并为每个创建 `.dlt`；可重复执行；单 broker 下 RF=1 可通过，RF>broker 数明确报错。
4. `docker compose config` 对 `docker-compose.prod.yml`、`docker-compose.github.yml`、`docker-compose.prod.yml + docker-compose.kafka-ha.yml`（含/不含 profile）均渲染成功。
5. `docker-compose.prod.yml` / `docker-compose.github.yml` 不再引用 `latest` 基础设施镜像。
6. 运维文档包含生产端/消费端参数、预建 topic、HA 启用步骤、RF 说明、DLT 与回滚说明。

## 10. 后续待办

- 调整各 java 服务的 `depends_on`，使 HA 模式可以彻底停用原单 broker 容器。
- 提供 DLT 重投工具与 DLT 积压监控告警规则。
- 在预发环境补做 broker 故障演练，并把结果写入运维文档。
- 同步修正仍引用 `timescaledb:latest-pg16` 的其它文档（telemetry-governance 相关）。
- 评估 rule/data-forward 消费链路的业务级幂等（P1-15）。

## 11. 关联文档

- [运维说明](../operations/connector-management-auth-kafka-reliability.md)
- [Connector 管理面鉴权与 Kafka 统一重试/死信设计方案](connector-management-auth-kafka-reliability.md)
- [部署说明](../operations/docker-compose-deployment.md)
