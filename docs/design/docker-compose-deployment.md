# Docker Compose 单机部署设计说明

## 1. 背景

单机宿主机曾同时存在两套 Firefly 基础设施：

- 旧部署：直接在其他目录执行 `docker compose up -d`，Compose 工程名由目录名派生，容器标签可能是 `shg` 等非标准项目名。
- 当前部署：统一走仓库内 `deploy/deploy.sh` 和 `deploy/docker-compose.prod.yml`，Compose 工程名固定为 `firefly-iot`。

两套部署都使用固定容器名 `firefly-postgres`、`firefly-redis`、`firefly-kafka`、`firefly-minio`、`firefly-zlmediakit` 等。只要旧容器没有退场，当前脚本再次执行 `bash deploy.sh infra` 或 `bash deploy.sh up` 就会因为容器名冲突直接失败。

同时，旧部署的数据卷名跟 Compose 工程名绑定，例如 `shg_postgres_data`。当新工程改用 `firefly-iot` 时，即使容器冲突被排掉，也会落到一组新的空卷上，导致部署无法无缝接管历史数据。

## 2. 目标

- 让单机 Docker 部署只保留一套受控入口：`deploy/deploy.sh`。
- 让持久化卷名称不再依赖 Compose 工程目录，避免历史目录名变化再次产生新卷。
- 在启动前明确识别“同名但不属于当前 Compose 工程”的旧容器，避免误把旧容器当成当前发布的一部分。
- 明确旧版独立 EMQX 已退出当前默认部署，MQTT 1883 由 `firefly-connector` 内置 Broker 负责。
- 让 Kafka 广播地址能同时适配“全量 Compose”与“局域网共享基础设施”两种部署口径，避免客户端拿到 `localhost:9092` 后回连失败。
- 让当前仍处于开发阶段的共享宿主机默认落到 `dev` Profile 和 `firefly-dev` 命名空间，禁止再以 `prod` 作为隐式默认值。

## 3. 非目标

- 不兼容保留旧版 `/home/<user>/docker-compose.yml` 作为长期并行入口。
- 不在代码里为旧版独立 EMQX 保留双轨运行逻辑。
- 不在 Compose 中继续使用跟目录名强绑定的匿名项目卷。

## 4. 设计方案

### 4.1 固定持久化卷名称

为以下卷增加显式 `name`，并允许通过 `.env` 覆盖：

- `postgres_data -> POSTGRES_VOLUME_NAME`
- `redis_data -> REDIS_VOLUME_NAME`
- `kafka_data -> KAFKA_VOLUME_NAME`
- `minio_data -> MINIO_VOLUME_NAME`
- `connector_mqtt_data -> CONNECTOR_MQTT_VOLUME_NAME`

默认值采用稳定的 Firefly 命名，例如 `firefly-postgres-data`、`firefly-kafka-data`，不再依赖 Compose 工程名。

`deploy.sh` 会在启动前预创建缺失卷，并补上 Compose 项目标识，避免新宿主机首次部署时再生成跟目录名绑定的项目卷。

这样无论仓库放在哪个目录，只要 `.env` 一致，新的 Compose 工程都会落到同一组卷名；历史宿主机也可以在迁移窗口内先把旧卷数据复制到这组稳定卷名，再切换到当前脚本统一管理。

### 4.2 启动前冲突预检

在 `deploy/deploy.sh` 中新增同名容器预检：

- 如果目标容器不存在，继续部署。
- 如果目标容器存在且 `com.docker.compose.project=firefly-iot`，视为当前工程已有实例，允许继续。
- 如果目标容器存在但标签属于其他 Compose 工程，或根本没有 Compose 标签，直接失败并打印所属工程/配置文件路径。

这样可以把原先 Docker 的“容器名已占用”底层错误提前收敛成明确的运维动作：先退役旧容器，再执行当前部署。

### 4.3 MQTT 基础设施收口

当前仓库的默认 MQTT 入口已经收敛到 `firefly-connector` 内置 Broker：

- `firefly-connector` 暴露 `1883`
- 设备路由、节点心跳和下行转发依赖 Redis + Kafka
- 旧版独立 `firefly-emqx` 不再属于当前默认基础设施

因此历史宿主机在迁移到当前 Compose 时，必须退役独立 EMQX，避免端口 `1883` 冲突和双 Broker 并存。

### 4.4 Kafka 广播地址收口

`deploy/docker-compose.prod.yml` 中 Kafka Broker 的 `KAFKA_ADVERTISED_LISTENERS` 改为通过 `.env` 注入 `KAFKA_ADVERTISED_HOST`：

- 默认值使用 `kafka`，保证全量 Compose 部署里的容器间访问稳定
- 当宿主机只提供共享基础设施、客户端运行在宿主机外部时，运维可把 `KAFKA_ADVERTISED_HOST` 显式改成宿主机局域网 IP 或 DNS

这样可以避免 Kafka 把 `localhost:9092` 返回给客户端，导致开发机或其他节点错误回连到自身回环地址。

### 4.5 开发阶段默认环境收口

当前共享宿主机仍属于开发阶段，但原部署模板把以下默认值写成了生产口径：

- `.env.example` 默认 `DEPLOY_ENV=prod`
- `.env.example` 默认 `NACOS_NAMESPACE=firefly-prod`
- `deploy/docker-compose.prod.yml` 把 `SPRING_PROFILES_ACTIVE` 写死为 `prod`

这会带来两个问题：

- 运维在没有显式检查 `.env` 时，很容易误把共享开发宿主机当成生产配置维护
- 后续如果有人直接在该宿主机上执行 `bash deploy.sh up`，业务容器会落到 `prod` Profile，和当前本地联调使用的 `firefly-dev` 命名空间脱节

本次收口方案：

- `.env.example` 默认值改为 `DEPLOY_ENV=dev`、`NACOS_NAMESPACE=firefly-dev`
- `deploy.sh` 在读取 `.env` 后校验 `DEPLOY_ENV` 只能是 `dev` 或 `prod`
- 如果 `.env` 未显式填写 `NACOS_NAMESPACE`，`deploy.sh` 自动按 `firefly-${DEPLOY_ENV}` 推导
- `deploy/docker-compose.prod.yml` 中业务容器的 `SPRING_PROFILES_ACTIVE` 改为引用 `${DEPLOY_ENV}`

这样当前阶段的默认行为就是明确的开发环境；只有在运维显式改成 `DEPLOY_ENV=prod` 后，才会进入生产口径。

## 5. 风险与约束

- 历史数据卷迁移前，不能直接删除旧容器和旧卷，否则会造成数据丢失。
- PostgreSQL、Kafka、MinIO 卷迁移需要在旧容器停止后进行，避免复制过程拿到不一致数据。
- `deploy.sh` 只做冲突检测，不自动强拆未知来源容器；实际退役动作由运维按宿主机现状执行。
- 当前仍保留 `deploy/docker-compose.yml` 作为本机临时联调入口，但共享宿主机和标准部署必须统一走 `deploy.sh`，避免再次出现环境口径分叉。
