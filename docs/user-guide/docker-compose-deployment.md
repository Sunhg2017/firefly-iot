# Docker Compose 单机部署使用说明

## 1. 谁来使用

适用于负责单机环境部署、升级和日常查看状态的开发或运维同学。

## 2. 首次部署

1. 进入 `deploy/`
2. 执行 `cp .env.example .env`
3. 按宿主机实际地址修改 `.env`，重点检查：
   - `DEPLOY_ENV`
   - `NACOS_NAMESPACE`
   - `POSTGRES_PASSWORD`
   - `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`
   - `KAFKA_ADVERTISED_HOST`
   - `ZLM_HOST` / `ZLM_PUBLIC_HOST`
   - `ZLM_SECRET`
4. 当前还在开发阶段时，保持：
   - `DEPLOY_ENV=dev`
   - `NACOS_NAMESPACE=firefly-dev`
5. 只有正式生产部署时，才切换为：
   - `DEPLOY_ENV=prod`
   - `NACOS_NAMESPACE=firefly-prod`
6. 启动基础设施：`bash deploy.sh infra`
7. 启动全量服务：`bash deploy.sh up`

在共享宿主机上，执行这些命令的部署用户需要已经加入 `docker` 组；否则直接运行 `bash deploy.sh status` 或 `docker ps` 会报权限错误。

当前标准部署不再要求宿主机预装 Maven 或 Node.js；`deploy.sh build` / `deploy.sh up` 会直接在 Docker 多阶段构建里完成后端和前端编译。

现在后端镜像会按服务顺序构建，并复用 Docker BuildKit 的 Maven 缓存：

- 第一次冷启动时会看到 Maven 下载日志，这是正常现象
- 同一台宿主机后续再次执行 `bash deploy.sh build` / `bash deploy.sh up` 会明显更快
- 当前默认使用华为云 Maven 镜像，不再直接走 Maven Central
- 如果上一次构建是异常中断，脚本会先检查残留 BuildKit 锁；必要时会提示你授权一次 sudo 来清理后再继续
- `bash deploy.sh up` 返回成功前，会额外等待基础设施健康、后端容器健康，以及 `Gateway / Rule / Web` 入口真正可访问
- 基础设施阶段不会再在每次执行时重编译 ZLMediaKit；只有第一次缺少镜像时才会自动构建
- 稳定持久化卷现在按 external volume 管理，重复部署不会再出现旧卷归属告警；如果执行 `bash deploy.sh clean`，这些卷也会被脚本一并删除

`KAFKA_ADVERTISED_HOST` 的选择规则：

- 全量 Compose 部署：保持默认值 `kafka`
- 局域网共享基础设施：改成宿主机 IP 或 DNS，例如 `192.168.123.102`

`DEPLOY_ENV` / `NACOS_NAMESPACE` 的使用规则：

- 开发联调宿主机：保持 `dev` / `firefly-dev`
- 正式生产宿主机：显式改成 `prod` / `firefly-prod`
- 如果 `.env` 留空 `NACOS_NAMESPACE`，`deploy.sh` 会自动按 `firefly-${DEPLOY_ENV}` 推导
- 即使保持 `DEPLOY_ENV=dev`，当前 Compose 也会自动把 Gateway 的内部转发宿主改成 `firefly-system`、`firefly-device` 等服务名，不需要再手工把共享宿主机切成 `prod`

## 3. 常用命令

- 只启动基础设施：`bash deploy.sh infra`
- 预构建业务镜像：`bash deploy.sh build`
- 全量部署：`bash deploy.sh up`
- 查看状态：`bash deploy.sh status`
- 查看日志：`bash deploy.sh logs <service>`
- 停止服务：`bash deploy.sh down`
- 重启业务服务：`bash deploy.sh restart`

如果你发现命令输出里还在提示 `the attribute 'version' is obsolete`，说明当前宿主机还没切到新版 Compose 文件，需要先同步最新仓库再执行部署。

如果你看到 `mvn: command not found`，也说明宿主机还在跑旧版部署链路；同步到当前版本后，这个问题会随着 Docker 内部构建一起消失。

如果第一次执行 `bash deploy.sh build` 比较久，先看日志是否在持续下载 Maven 依赖；当前版本会自动复用缓存，首次构建完成后后续速度会恢复正常。

如果前一次构建是手工中断、SSH 断开或宿主机异常退出，下一次执行 `bash deploy.sh build` / `bash deploy.sh up` 时：

- 脚本会先检查是否有残留 BuildKit executor
- 如果只是残留锁，没有别的构建在跑，会先清理再继续
- 如果当前是非交互终端，脚本会直接给出需要执行的 `sudo kill <pid...>` 提示，不会继续假装构建

如果你是用 `bash deploy.sh up` 做标准部署，脚本结束后可以直接开始验收：

- `http://localhost:8080/actuator/health`
- `http://localhost:9030/actuator/health`
- `http://localhost/`

这三个入口已经被脚本自身等到可访问，不需要再额外手工 `sleep`。

## 4. 持久化卷配置

`.env` 里可以直接指定稳定卷名：

- `POSTGRES_VOLUME_NAME`
- `REDIS_VOLUME_NAME`
- `KAFKA_VOLUME_NAME`
- `MINIO_VOLUME_NAME`
- `CONNECTOR_MQTT_VOLUME_NAME`

默认值已经写入 `.env.example`。如果宿主机要接管历史卷数据，先迁移旧卷，再保持这些变量不变继续运行。
执行 `bash deploy.sh infra` 或 `bash deploy.sh up` 时，脚本会自动补齐缺失的稳定卷。

## 4.1 远端目录基线

共享宿主机当前固定使用：

- 代码目录：`/home/shg/codeRepo/firefly-iot`
- 旧源码树备份：`/home/shg/backups/firefly-iot-non-git-latest`

日常部署、查看状态、看日志都只在当前代码目录下进行；不要直接在备份目录里执行 `deploy.sh`。

## 5. 旧环境接管提示

如果执行 `bash deploy.sh infra` 时看到类似下面的提示：

- `Container firefly-kafka belongs to compose project 'xxx'`
- `Container firefly-postgres already exists and was not created by compose project 'firefly-iot'`

说明宿主机上还有旧部署留下的同名容器。先退役旧容器，再重新执行当前脚本；不要直接强行修改当前 Compose 去兼容旧工程名。

## 6. MQTT 使用提醒

当前默认 MQTT 入口是 `firefly-connector` 自带 Broker：

- 设备连接端口：`1883`
- 不需要再单独启动 EMQX
- 如果历史环境仍有 `firefly-emqx`，应先停掉，避免端口冲突

## 7. 登录异常自查

如果页面能打开，但登录接口返回 500，优先检查 Gateway 是否还在把开发环境路由打到 `127.0.0.1`。

你应该看到：

- `firefly-gateway` 容器已启动
- `firefly-system` 容器已启动
- Gateway 容器环境里存在 `FIREFLY_GATEWAY_SYSTEM_HOST=firefly-system`

如果缺少这些变量，重新执行一次 `bash deploy.sh up`，让 Gateway 按当前 Compose 配置重建。

如果 Gateway 已经正常转发，但登录仍然返回 500，再看 `firefly-system` 日志里是否有 `Tenant context not set`。出现这个报错时，说明系统服务还没有升级到“登录前全局查用户绕过租户拦截”的版本，需要重建 `firefly-system` 后再试。
