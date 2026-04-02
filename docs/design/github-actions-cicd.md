# GitHub Actions CI/CD 设计说明

## 1. 背景

当前仓库已经有 GitHub Actions 基础 workflow，但原实现存在两个关键断点：

- Workflow 已把业务镜像推送到 GHCR，生产 Compose 仍然使用 `build:` 从源码构建业务服务，导致远端 `docker compose pull` 无法拉取新版本业务镜像。
- 远端部署步骤没有和 `deploy/deploy.sh` 的卷初始化、ZLMediaKit 配置生成、健康检查等待逻辑打通，首次部署或宿主机恢复后的稳定性不足。

因此本次收口目标不是新增一套平行的说明文档，而是把 GitHub Actions、GHCR 镜像和仓库现有部署脚本接成一条可执行链路。

## 2. 目标与范围

### 2.1 目标

- 在 GitHub 上统一执行后端 Maven 校验、前端 TypeScript 构建与 Docker 镜像构建。
- 使用 GHCR 承载 `firefly-gateway`、`firefly-system`、`firefly-device`、`firefly-rule`、`firefly-media`、`firefly-data`、`firefly-support`、`firefly-connector`、`firefly-web` 的发布镜像。
- 通过发布标签 `v*` 触发自动部署。
- 保留仓库现有 `deploy.sh up` 的源码构建部署能力，不破坏当前单机源码部署入口。

### 2.2 范围

本次范围包括：

- `/.github/workflows/ci.yml`
- `deploy/docker-compose.github.yml`
- `deploy/deploy.sh release`
- `deploy/.env.example`
- 与该链路对应的 README / 设计 / 运维 / 使用文档

本次范围不包括：

- Kubernetes / Helm 发布
- 多环境自动 promotion
- 数据库结构的额外迁移编排

## 3. 方案概览

### 3.1 CI 流程

1. `push` / `pull_request` 到当前默认分支 `master`、兼容分支 `main` 或 `develop`
2. 执行 Maven `clean verify`
3. 执行前端 `npm ci`、`tsc --noEmit`、`npm run build`

### 3.2 CD 流程

1. 推送 `v*` 标签
2. GitHub Actions 使用 `docker/build-push-action` 构建并推送 GHCR 镜像
3. 工作流通过 SSH 登录部署机
4. 部署机切到对应 Git 标签
5. 执行 `bash deploy.sh release`
6. `deploy.sh release` 完成卷初始化、ZLMediaKit 配置准备、基础设施启动、GHCR 登录、业务镜像拉取、应用启动与健康检查

## 4. 关键设计

### 4.1 单独新增 GitHub 发布 Compose

新增 `deploy/docker-compose.github.yml`，原因如下：

- 当前 `deploy/docker-compose.prod.yml` 明确服务于 `deploy.sh up` 的源码构建模式。
- 如果直接把 `prod` Compose 改为 `image:` 模式，会连带改变现有源码部署行为，影响当前文档和运维口径。
- GitHub 发布 Compose 专门使用 `APP_IMAGE_REGISTRY`、`APP_IMAGE_NAMESPACE`、`APP_IMAGE_TAG` 指向 GHCR 镜像，和源码构建入口解耦。

### 4.2 在 `deploy.sh` 中增加 `release` 命令

新增 `release` 命令而不是在 workflow 里直接拼一串 `docker compose`，原因如下：

- 当前卷创建逻辑在 `deploy.sh` 中统一维护。
- 当前 ZLMediaKit `config.ini` 生成逻辑在 `deploy.sh` 中统一维护。
- 当前基础设施与应用健康检查等待逻辑在 `deploy.sh` 中统一维护。
- 这样可以避免 GitHub Actions 和手工运维脚本分别维护两套启动细节。

### 4.3 镜像标记策略

工作流对业务镜像统一推送以下标签：

- `branch` 标签：例如 `master`、`main`、`develop`
- `tag` 标签：例如 `v1.0.0`
- `sha` 标签：对应提交 SHA
- `latest`：仅默认分支推送；当前仓库默认分支是 `master`

部署链路固定使用 GitHub 触发标签本身，例如 `v1.0.0`，保证“发布标签”和“部署镜像标签”一致。

### 4.4 Registry 鉴权

部署机通过环境变量注入 `APP_IMAGE_REGISTRY_USERNAME` 与 `APP_IMAGE_REGISTRY_PASSWORD`，由 `deploy.sh release` 在拉取镜像前执行 `docker login`。

这样做的原因：

- 不要求在服务器长期落地 GHCR 密钥文件
- 同一条部署命令既支持私有 GHCR，也支持未来替换为其他镜像仓库

## 5. 配置项

`deploy/.env.example` 新增以下镜像配置：

- `APP_IMAGE_REGISTRY`
- `APP_IMAGE_NAMESPACE`
- `APP_IMAGE_TAG`

其中：

- `APP_IMAGE_REGISTRY` 默认 `ghcr.io`
- `APP_IMAGE_NAMESPACE` 由 GitHub Actions 发布时注入，格式为 `<owner>/<repo>`
- `APP_IMAGE_TAG` 默认 `latest`，发布时由 workflow 注入为 `v*` 标签

## 6. 风险与取舍

### 6.1 服务器仓库处于 detached HEAD

部署 job 会切到对应 Git 标签，这会让服务器仓库处于 detached HEAD。这里选择接受该状态，因为部署目标是“准确复现该发布标签”，而不是把服务器工作树固定在某个长期本地分支。

### 6.2 ZLMediaKit 仍在宿主机构建

当前自动发布只把 Firefly 业务镜像交给 GHCR，`zlmediakit` 仍由部署机按仓库内 Dockerfile 构建。这是当前实现的显式取舍，因为该镜像不在本次 GitHub 发布矩阵内。

### 6.3 首次部署仍需正确准备 `.env`

GitHub Actions 负责发布和触发部署，但数据库、Kafka、MinIO、Nacos、JWT、公网地址等运行参数仍由部署机 `deploy/.env` 控制；这些参数不应被写死进 workflow。
