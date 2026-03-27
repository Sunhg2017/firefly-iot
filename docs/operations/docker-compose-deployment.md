# Docker Compose 单机部署运维说明

## 1. 适用范围

适用于通过仓库内 `deploy/deploy.sh`、`deploy/docker-compose.prod.yml` 在单机宿主机部署 Firefly IoT 的场景。

## 2. 依赖服务

- Docker Engine / Docker Compose v2
- 宿主机可用端口：`80`、`8080`、`8848`、`9000`、`9001`、`10000`、`18080`、`1883` 等
- 持久化卷：PostgreSQL、Redis、Kafka、MinIO、Connector MQTT 数据目录

## 3. 标准部署步骤

1. 进入仓库 `deploy/` 目录。
2. 复制并调整环境变量：`cp .env.example .env`
3. 启动基础设施：`bash deploy.sh infra`
4. 启动全量服务：`bash deploy.sh up`
5. 查看状态：`bash deploy.sh status`

## 4. 旧 Compose 收口步骤

当宿主机上已经存在其他目录启动的旧版 `firefly-*` 容器时，必须先完成收口，再执行当前脚本。

### 4.1 识别旧容器归属

使用 `docker inspect` 检查容器标签：

- `com.docker.compose.project`
- `com.docker.compose.project.config_files`
- `com.docker.compose.project.working_dir`

如果这些标签不是当前工程 `firefly-iot`，说明容器并非由当前脚本管理。

### 4.2 迁移历史数据卷

当前版本默认使用固定卷名：

- `firefly-postgres-data`
- `firefly-redis-data`
- `firefly-kafka-data`
- `firefly-minio-data`
- `firefly-connector-mqtt-data`

缺失的稳定卷会在执行 `bash deploy.sh infra` / `bash deploy.sh up` 时自动创建。

若宿主机还保留旧卷（例如 `shg_postgres_data`、`shg_kafka_data`），执行迁移前要先停止旧容器，然后把旧卷数据复制到当前稳定卷名，再由当前 Compose 接管。

建议顺序：

1. 停止旧容器：PostgreSQL、Redis、Kafka、Nacos、MinIO、Sentinel、ZLMediaKit、EMQX
2. 复制旧卷到当前稳定卷
3. 删除或归档旧容器
4. 重新执行 `bash deploy.sh infra`

### 4.3 退役旧版 EMQX

当前默认 MQTT 入口为 `firefly-connector` 内置 Broker，旧版独立 `firefly-emqx` 必须退役：

- 否则 `1883` 端口会和 `firefly-connector` 冲突
- 运维排障时也会出现“双 Broker”误判

## 5. 常见故障

### 5.1 `container name is already in use`

说明宿主机存在同名旧容器。当前 `deploy.sh` 会在 `docker compose up` 之前直接报出容器名和旧工程名。按“旧 Compose 收口步骤”先退役旧容器后再执行部署。

### 5.2 新容器启动后数据为空

通常是因为容器已经切到新工程，但仍挂到了新建空卷，而旧数据还留在历史项目卷里。检查以下卷名是否有历史数据：

- `shg_postgres_data`
- `shg_redis_data`
- `shg_kafka_data`
- `shg_minio_data`

确认后重新停机迁移卷，再启动当前 Compose。

### 5.3 `1883` 端口被占用

优先检查是否还有旧版 `firefly-emqx`。当前仓库不再把 EMQX 作为默认基础设施。

## 6. 回滚说明

- 如果当前 Compose 刚接管失败，但旧卷仍保留，可停掉新容器后重新恢复旧容器。
- 如果已经确认新容器数据正确，再安排窗口清理历史卷和旧 Compose 文件。
