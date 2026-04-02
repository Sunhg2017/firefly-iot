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
- 让共享宿主机即使保持 `DEPLOY_ENV=dev`，Gateway 也能在容器网络内正确转发 `/SYSTEM|DEVICE|RULE|DATA|SUPPORT|MEDIA|CONNECTOR` 路由，不再误回环到容器自身的 `127.0.0.1`。
- 让部署用户 `shg` 直接具备 Docker CLI 执行能力，后续运行 `bash deploy.sh status/up/logs` 不再依赖额外 `sudo` 包裹。
- 让 Compose 文件对齐当前 Docker Compose v2 规范，删除已经废弃且只会产生告警的 `version` 顶层字段。
- 让后端服务镜像在 Docker 构建阶段直接完成 Maven 打包，宿主机部署入口不再依赖本地 Maven 安装。
- 让弱网宿主机上的首次源码构建不再被多服务并发重复下载 Maven 依赖拖垮，保证标准 `deploy.sh build/up` 链路可预测。

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

### 4.6 Gateway 开发环境路由宿主收口

`firefly-gateway` 的 `application.yml` 原本把开发环境静态路由写死成：

- `http://127.0.0.1:8081`
- `http://127.0.0.1:9020`
- `http://127.0.0.1:9030`
- `http://127.0.0.1:9040`
- `http://127.0.0.1:9050`
- `http://127.0.0.1:9060`
- `http://127.0.0.1:9070`

这个口径只适合“Gateway 和所有业务服务都直接跑在同一台宿主机进程里”的本地开发方式；一旦 Gateway 自己跑进 Docker 容器，`127.0.0.1` 就只指向 Gateway 容器本身，登录等接口会直接报 `Connection refused`。

本次收口方案：

- 开发环境静态路由改为读取 `FIREFLY_GATEWAY_*_HOST` 环境变量，默认仍回落到 `127.0.0.1`
- `deploy/docker-compose.prod.yml` 仅对 Gateway 容器注入 `firefly-system`、`firefly-device` 等 Compose 服务名
- 这样共享宿主机仍可保持 `DEPLOY_ENV=dev`，但容器内路由会自动走 Compose 网络服务名，不再和本地 IDE 口径打架

结果：

- 本地直跑 Gateway 时，不配环境变量仍沿用 `127.0.0.1`
- 单机 Compose 部署时，Gateway 自动转发到 `firefly-*` 容器服务名
- 不需要把共享开发宿主机整体切到 `prod` 才能让登录链路恢复

### 4.7 部署入口权限与 Compose 规范收口

当前宿主机上的标准部署入口是仓库内 `deploy/deploy.sh`。如果部署用户本身不在 `docker` 组里，脚本虽然还能通过 `sudo bash deploy.sh ...` 运行，但会带来两个实际问题：

- 值班或联调时，同一个用户执行 `bash deploy.sh status` / `bash deploy.sh logs` 会直接报 Docker socket 权限错误
- 部署入口会被人为拆成“有时直接跑、有时再包一层 sudo”，长期容易演变成新的运维分叉

本次收口约定：

- 共享宿主机上的标准部署用户加入 `docker` 组
- 后续默认直接以该用户执行 `bash deploy.sh infra|up|status|logs`
- `sudo` 只保留给系统级维护动作，不再作为日常 Compose 入口前缀

同时，`deploy/docker-compose.yml` 与 `deploy/docker-compose.prod.yml` 删除顶层 `version` 字段。当前 Docker Compose v2 已按 Compose Specification 解析配置，保留 `version` 只会持续打印 `the attribute 'version' is obsolete` 告警，不再提供任何兼容收益。

脚本侧也同步收口：

- `deploy.sh` 在真正执行 `docker` / `docker compose` 前先做一次 Docker 可达性检查
- 如果是 Docker socket 权限不足，直接给出“加入 `docker` 组”或“重新登录 shell”提示
- 如果是 Docker daemon 未启动，则直接提示先恢复 Docker 服务，而不是把底层长报错原样抛给值班人员

### 4.8 远端源码树备份与回滚基线

共享宿主机已经把旧的“非 git 同步源码树”切换成正式仓库 checkout，但回滚时仍需要一份固定、可预测的源码基线：

- 当前受管目录：`/home/shg/codeRepo/firefly-iot`
- 旧非 git 源码树备份目录：`/home/shg/backups/firefly-iot-non-git-<timestamp>`
- 固定最新软链：`/home/shg/backups/firefly-iot-non-git-latest`

这样后续出现两类回退场景时都有明确入口：

- 代码版本回退：直接在正式 git checkout 中 `git checkout` / `git reset --hard <commit>` 后重建容器
- 源码树整体回退：把 `firefly-iot-non-git-latest` 指向的备份目录恢复回 `/home/shg/codeRepo/firefly-iot`

运行态配置继续单独保留在部署目录下：

- `deploy/.env`
- `deploy/runtime/zlmediakit/config.ini`

源码树切换时只复制这两类运行文件，不把运行态状态重新散回 Git 仓库。

### 4.9 后端镜像构建链路收口

之前 `deploy.sh up` 先在宿主机执行 Maven 打包，再让 `deploy/Dockerfile` 把 `target/*.jar` 复制进镜像。这个方案在共享宿主机上已经暴露出明确问题：

- 远端没有 Maven 时，`bash deploy.sh up` 会直接失败
- 即使代码已同步到远端，部署链路仍依赖宿主机 Java / Maven 工具链
- 运维入口会退化成“本地先编译再手工传 jar”，无法继续收口成标准 Compose 发布

本次直接改成单一路径：

- `deploy/Dockerfile.web` 继续沿用前端多阶段构建
- `deploy/Dockerfile` 改成后端多阶段构建，第一阶段用 Maven 镜像在容器内执行 `mvn -pl <module> -am package -DskipTests`
- `deploy/Dockerfile` 直接写入 Maven `settings.xml` 并通过 `mvn -s` 显式启用，默认把全部仓库请求镜像到 `https://repo.huaweicloud.com/repository/maven/`
- `deploy/Dockerfile` 通过 BuildKit `type=cache` 共享 `/root/.m2`，让顺序构建时后续服务直接复用前序服务已经下载好的 Maven 依赖
- `deploy.sh` 在进入构建前会先检查 `/var/lib/docker/buildkit/executor/` 残留进程；如果上一次异常退出留下了 BuildKit 锁，会先清理后再继续构建，避免再次卡死在首个 Maven 步骤
- `deploy.sh build` 改为顺序构建后端服务镜像，再单独构建前端，避免多个服务冷启动时并发重复下载同一批依赖
- `deploy.sh up` 不再调用宿主机 Maven，而是按“基础设施 -> 顺序构建后端 -> 启动后端 -> 构建并启动前端 -> 等待基础设施与关键入口就绪”执行
- `deploy.sh infra` / `deploy.sh up` 启动基础设施时不再携带 `--build`；重复部署默认复用现有 `firefly-zlmediakit` 镜像，只在镜像首次缺失时才让 Compose 自动补构建
- 仓库根目录新增 `.dockerignore`，显式排除 `target/`、`node_modules/`、`deploy/.env`、运行时目录和模拟器等无关上下文，避免把本地产物重新打进构建上下文

这样标准部署宿主机只需要：

- Docker Engine
- Docker Compose v2
- 访问基础镜像仓库和 Maven/NPM 制品源的网络能力

不再要求宿主机额外安装 Maven 或 Node.js。

补充约束：

- 首次冷启动构建仍会下载 Maven 依赖，但同一台宿主机后续构建会复用 BuildKit Maven 缓存。
- 华为云 Maven 镜像是按 `192.168.123.102` 实测结果选出的默认值：同一 Lombok 2.1MB JAR 下载从 Maven Central 的约 148 秒降到约 0.33 秒。
- 后端镜像按服务顺序构建，牺牲一点并发换取稳定的弱网表现和可复用缓存。
- 如果前一次构建是异常中断，脚本会优先尝试清理残留 BuildKit executor；只有检测到另一个构建仍在运行时才会拒绝继续，避免误杀有效任务。
- `deploy.sh up` 最终返回前会等待 `postgres/redis/kafka/nacos/minio` 的容器健康检查通过，并额外探测 `ZLMediaKit API`、`Gateway actuator`、`Rule actuator` 与 `Web` 首页，避免容器刚启动就被宿主机侧探活撞到瞬时 `connection reset`。
- `192.168.123.102` 的远端复验已确认：此前每次 `up` 都会重跑 ZLMediaKit 的整套 C++ 编译；去掉基础设施阶段的 `--build` 后，重复部署不再触发这段无意义重编译。

## 5. 风险与约束

- 历史数据卷迁移前，不能直接删除旧容器和旧卷，否则会造成数据丢失。
- PostgreSQL、Kafka、MinIO 卷迁移需要在旧容器停止后进行，避免复制过程拿到不一致数据。
- `deploy.sh` 只做冲突检测，不自动强拆未知来源容器；实际退役动作由运维按宿主机现状执行。
- 当前仍保留 `deploy/docker-compose.yml` 作为本机临时联调入口，但共享宿主机和标准部署必须统一走 `deploy.sh`，避免再次出现环境口径分叉。
