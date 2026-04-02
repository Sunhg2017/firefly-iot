# Docker Compose 单机部署运维说明

## 1. 适用范围

适用于通过仓库内 `deploy/deploy.sh`、`deploy/docker-compose.prod.yml` 在单机宿主机部署 Firefly IoT 的场景。当前共享宿主机默认按开发阶段配置运行。

## 2. 依赖服务

- Docker Engine / Docker Compose v2
- 标准部署用户需要加入 `docker` 组，否则直接执行 `bash deploy.sh status/logs/up` 会因为 Docker socket 权限失败
- 宿主机可用端口：`80`、`8080`、`8848`、`9000`、`9001`、`10000`、`18080`、`1883` 等
- 持久化卷：PostgreSQL、Redis、Kafka、MinIO、Connector MQTT 数据目录

当前标准部署已经不再要求宿主机预装 Maven 或 Node.js；后端和前端镜像都在 Docker 多阶段构建里完成编译。

## 3. 标准部署步骤

1. 进入仓库 `deploy/` 目录。
2. 复制并调整环境变量：`cp .env.example .env`
3. 当前开发阶段必须确认：
   - `DEPLOY_ENV=dev`
   - `NACOS_NAMESPACE=firefly-dev`
4. 只有在正式生产部署时，才显式改成：
   - `DEPLOY_ENV=prod`
   - `NACOS_NAMESPACE=firefly-prod`
5. 启动基础设施：`bash deploy.sh infra`
6. 启动全量服务：`bash deploy.sh up`
7. 查看状态：`bash deploy.sh status`

如果只想提前拉依赖并编译镜像，可先执行：

- `bash deploy.sh build`

脚本行为补充：

- `deploy.sh` 会校验 `DEPLOY_ENV` 只能是 `dev` 或 `prod`
- 如果 `.env` 没写 `NACOS_NAMESPACE`，脚本会自动推导为 `firefly-${DEPLOY_ENV}`
- `bash deploy.sh infra` / `bash deploy.sh up` 日志会打印当前环境和命名空间，便于值班时快速识别
- `bash deploy.sh build` / `bash deploy.sh up` 直接从源码构建镜像，不再依赖宿主机 Maven
- 后端镜像会按服务顺序构建，并复用 Docker BuildKit 的 Maven 缓存；首次冷启动时间取决于制品源网络，但不会再被多服务并发重复下载放大
- 后端 Docker 构建默认改走华为云 Maven 镜像，避免当前宿主机直连 Maven Central 极慢
- 当前 Compose 会额外给 `firefly-gateway` 注入 `FIREFLY_GATEWAY_*_HOST=firefly-*`，保证 `DEPLOY_ENV=dev` 时容器内静态路由仍转发到 Compose 网络服务名，而不是误连 Gateway 容器自己的 `127.0.0.1`
- 当前 Compose 文件已经移除废弃的 `version` 顶层字段；如果值班时再次看到 `the attribute 'version' is obsolete`，说明宿主机仍在使用旧版 Compose 文件

Kafka 额外要求：

- `.env` 中的 `KAFKA_ADVERTISED_HOST` 必须与客户端实际访问 Kafka 元数据时看到的地址一致。
- 如果 Kafka 与所有 Java 服务一起跑在同一套 Compose 网络里，可保持默认值 `kafka`。
- 如果当前宿主机只承担共享基础设施，业务服务跑在宿主机外的开发机上，必须改成宿主机局域网 IP 或 DNS，例如 `192.168.123.102`。

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

### 5.1.1 `permission denied while trying to connect to the Docker daemon socket`

如果当前用户直接执行 `bash deploy.sh status`、`bash deploy.sh logs` 或 `docker ps` 时出现 Docker socket 权限错误，按下面顺序处理：

1. 确认部署用户已加入 `docker` 组：`id`
2. 如果还没加入，执行 `sudo usermod -aG docker <deploy-user>`
3. 重新登录一个新的 shell / SSH 会话后复验 `docker ps`

共享宿主机已经收口为“部署用户直接跑脚本”的口径，不建议再长期依赖 `sudo bash deploy.sh ...` 作为日常入口。

### 5.1.2 `mvn: command not found`

如果当前宿主机还是在执行旧版脚本，可能会看到：

- `mvn: command not found`

这说明宿主机还没切到“后端镜像在 Docker 内部打包”的版本。处理方式：

1. 同步最新仓库
2. 确认 `deploy/Dockerfile` 已经是多阶段 Maven 构建版本
3. 重新执行 `bash deploy.sh build` 或 `bash deploy.sh up`

标准版本下，这个报错不应该再出现。

### 5.1.3 首次 `bash deploy.sh build` 很慢

如果远端是第一次冷启动构建，常见现象是日志里连续出现 Maven 制品下载。

当前版本的预期行为：

- 后端服务顺序构建，不再并发重复拉同一批依赖
- Docker BuildKit 会复用 `/root/.m2` 缓存，后续构建明显加快
- 默认仓库源已经切到华为云 Maven 镜像；如果这里仍然慢，优先判断宿主机到镜像源本身的网络质量
- 如果上一次构建异常中断，`deploy.sh` 会先检查并清理残留的 BuildKit executor，再进入真正的镜像构建
- `deploy.sh up` 会在返回前等待基础设施健康检查、后端容器健康状态以及 `Gateway / Rule / Web` 宿主机入口可访问
- `deploy.sh infra` / `deploy.sh up` 不会再在每次执行时强制重编译 ZLMediaKit；只有镜像缺失时才会由 Compose 自动补建
- 持久化卷已经切到 external volume 口径；只要卷名稳定，Compose 不再对历史卷标签报警

排查顺序：

1. 确认 `deploy/Dockerfile` 顶部包含 `# syntax=docker/dockerfile:1.7`
2. 确认 `deploy/Dockerfile` 中的 Maven 命令包含 `-s /tmp/maven-settings.xml`
3. 确认 `deploy.sh` 执行时带着 `DOCKER_BUILDKIT=1`
4. 若长时间卡在首个后端服务的 Maven 下载，优先检查宿主机到华为云 Maven 镜像或私有镜像源的网络质量

在当前标准链路下，冷启动慢属于网络/制品源问题，不需要再回退到宿主机手工 Maven 打包。

### 5.1.4 构建卡在首个 Maven 步骤且前一次曾被中断

当前版本会先检查是否存在 `/var/lib/docker/buildkit/executor/` 残留进程。

- 如果没有残留，脚本直接进入构建
- 如果存在残留且当前没有其他构建进程，脚本会尝试清理后继续
- 如果检测到另一套 `docker compose ... build` / `deploy.sh build|up` 仍在运行，脚本会直接退出，避免误清理有效任务

运维处理口径：

1. 直接重新执行 `bash deploy.sh build` 或 `bash deploy.sh up`
2. 如果脚本提示需要 sudo，按提示授权一次，让它清理残留 BuildKit executor
3. 如果当前是非交互会话，按脚本提示在宿主机执行 `sudo kill <pid...>` 后再重试

当前实测根因样本来自 `192.168.123.102`：上一次中断构建留下了 root 侧 BuildKit executor，导致后续顺序构建长期卡在 `/root/.m2` 共享缓存锁；清理残留进程后构建立即恢复。

### 5.1.5 `deploy.sh up` 已结束，但外部立刻探活偶发 `connection reset`

当前版本的 `deploy.sh up` 已经补上启动后等待：

- 基础设施：`postgres/redis/kafka/nacos/minio` 健康检查 + `ZLMediaKit API`
- 应用容器：`gateway/system/device/rule/media/data/support/connector/web` 健康检查
- 宿主机入口：`http://localhost:8080/actuator/health`、`http://localhost:9030/actuator/health`、`http://localhost/`

如果脚本已经返回成功，默认就表示这些关键入口已经可访问；不需要再自行额外插入 `sleep 30` 之类的兜底等待。

### 5.1.6 每次 `deploy.sh up` 都重新编译 ZLMediaKit

当前版本已经去掉基础设施阶段的 `--build`，所以重复执行 `bash deploy.sh infra` / `bash deploy.sh up` 时：

- 已存在的 `firefly-zlmediakit` 镜像会直接复用
- 只有镜像首次缺失时，Compose 才会自动触发一次构建

`192.168.123.102` 的实测证据已经确认：此前重复 `up` 时日志会重新出现 ZLMediaKit 的大段 `Building CXX object ...`；调整后这段重复编译不再出现，部署时间明显收敛。

### 5.1.7 重复部署时出现 `volume already exists but was not created by Docker Compose`

当前版本已经把稳定卷声明成 external volume，并由 `deploy.sh` 提前创建。

- 重复执行 `bash deploy.sh infra` / `bash deploy.sh up` 时，不应再出现这类 volume 归属告警
- `bash deploy.sh clean` 会在 `docker compose down -v` 之后额外删除这些稳定卷，保持“清空数据”的语义不变

如果仍然出现旧告警，优先检查当前宿主机是否真的已经同步到最新仓库版本。

### 5.2 新容器启动后数据为空

通常是因为容器已经切到新工程，但仍挂到了新建空卷，而旧数据还留在历史项目卷里。检查以下卷名是否有历史数据：

- `shg_postgres_data`
- `shg_redis_data`
- `shg_kafka_data`
- `shg_minio_data`

确认后重新停机迁移卷，再启动当前 Compose。

### 5.3 `1883` 端口被占用

优先检查是否还有旧版 `firefly-emqx`。当前仓库不再把 EMQX 作为默认基础设施。

### 5.4 Kafka 客户端日志出现 `localhost:9092`

如果 `firefly-device`、`firefly-media` 或其他客户端日志里出现：

- `Connection to node 0 (localhost/127.0.0.1:9092) could not be established`

优先检查以下两项：

- 当前宿主机是否误用了 `deploy/docker-compose.prod.yml` 的默认 Kafka 广播地址
- `.env` 里的 `KAFKA_ADVERTISED_HOST` 是否仍是默认值，而当前客户端其实跑在 Compose 网络之外

处理方式：

1. 按客户端实际访问路径，把 `KAFKA_ADVERTISED_HOST` 改成 `kafka` 或宿主机真实 IP/DNS
2. 重新执行 `bash deploy.sh infra` 或手工重建 `kafka`
3. 确认客户端重新获取元数据后不再尝试连接 `localhost:9092`

### 5.5 共享开发宿主机误配成 `prod`

如果发现宿主机 `.env` 中出现以下组合：

- `DEPLOY_ENV=prod`
- `NACOS_NAMESPACE=firefly-prod`

但当前环境实际上仍处于开发联调阶段，按下面步骤收口：

1. 把 `.env` 改回 `DEPLOY_ENV=dev`
2. 把 `.env` 改回 `NACOS_NAMESPACE=firefly-dev`
3. 确认共享基础设施宿主机只保留开发命名空间服务：`curl 'http://127.0.0.1:8848/nacos/v1/ns/catalog/services?namespaceId=firefly-dev&pageNo=1&pageSize=50'`
4. 如该宿主机未来需要起业务容器，再执行 `bash deploy.sh up`，避免继续以 `prod` Profile 启动

### 5.6 Gateway 登录接口报 `Connection refused: /127.0.0.1:8081`

如果访问 `/SYSTEM/api/v1/auth/login` 时出现：

- 返回 `500 Internal Server Error`
- `firefly-gateway` 日志包含 `Connection refused: /127.0.0.1:8081`

根因通常是 Gateway 还在使用旧的开发环境静态路由口径，容器内把 `127.0.0.1` 解析成了 Gateway 自身，而不是 `firefly-system` 容器。

处理步骤：

1. 确认当前版本已经包含 Gateway 路由宿主收口修复。
2. 检查 `firefly-gateway` 容器环境变量里是否存在：
   - `FIREFLY_GATEWAY_SYSTEM_HOST=firefly-system`
   - `FIREFLY_GATEWAY_DEVICE_HOST=firefly-device`
   - `FIREFLY_GATEWAY_RULE_HOST=firefly-rule`
   - `FIREFLY_GATEWAY_DATA_HOST=firefly-data`
   - `FIREFLY_GATEWAY_SUPPORT_HOST=firefly-support`
   - `FIREFLY_GATEWAY_MEDIA_HOST=firefly-media`
   - `FIREFLY_GATEWAY_CONNECTOR_HOST=firefly-connector`
3. 重建 Gateway：`bash deploy.sh up` 或单独执行 `docker compose ... up -d --build gateway`
4. 再用 `curl http://127.0.0.1:8080/SYSTEM/api/v1/auth/login` 复验

不要为了绕开这个问题把共享开发宿主机直接改成 `DEPLOY_ENV=prod`；这不是环境名问题，而是容器内静态路由错误使用了 `127.0.0.1`。

### 5.7 登录接口报 `Tenant context not set`

如果 Gateway 已经不再报 `/127.0.0.1:8081`，但登录仍返回 `500`，并且 `firefly-system` 日志出现：

- `Tenant context not set`
- 堆栈落在 `UserMapper.findByIdentifierGlobal`

根因是账号密码登录在“租户尚未解析出来”之前就先按用户名/手机号/邮箱全局查用户；这类全局查询必须显式绕过 MyBatis Plus 的租户行拦截，否则第一次查用户就会直接抛错。

处理步骤：

1. 确认 `firefly-system` 版本已经包含 `UserMapper.findByIdentifierGlobal` 的 `@InterceptorIgnore(tenantLine = "true")` 修复。
2. 重建 `firefly-system`：`docker compose ... up -d --build system`
3. 再次调用 `POST /SYSTEM/api/v1/auth/login` 验证

这个问题也不要靠手工补默认租户、改数据库或临时切 `prod` 规避，正确修复点就是让“登录前的全局用户定位”脱离租户行拦截。

## 6. 回滚说明

### 6.1 代码版本回滚

当前远端部署目录已经是正式 git checkout：

- 代码目录：`/home/shg/codeRepo/firefly-iot`
- 默认分支：`master`

如果只是应用版本需要回退，按下面顺序执行：

1. `cd /home/shg/codeRepo/firefly-iot`
2. `git log --oneline` 确认目标提交
3. `git checkout <target-commit>` 或切回对应 tag / branch
4. `cd deploy && bash deploy.sh up`
5. `bash deploy.sh status` 复验容器状态

### 6.2 源码树整体回滚

如果正式 checkout 本身被误改、误删，或者需要临时恢复切换前的非 git 源码树，使用固定备份基线：

- 最新旧树软链：`/home/shg/backups/firefly-iot-non-git-latest`

推荐顺序：

1. 进入 `/home/shg/codeRepo`
2. 将当前 `firefly-iot` 目录先改名归档
3. 把 `firefly-iot-non-git-latest` 指向的目录恢复为新的 `/home/shg/codeRepo/firefly-iot`
4. 确认以下运行文件仍存在：
   - `deploy/.env`
   - `deploy/runtime/zlmediakit/config.ini`
5. 再进入 `deploy/` 执行 `bash deploy.sh status` / `bash deploy.sh up`

### 6.3 数据与旧卷回退

- 如果当前 Compose 刚接管失败，但旧卷仍保留，可停掉新容器后重新恢复旧容器或旧卷。
- 如果已经确认新容器数据正确，再安排窗口清理历史卷和旧 Compose 文件。
