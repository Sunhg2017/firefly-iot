# GitHub Actions CI/CD 运维说明

## 1. 适用范围

适用于当前仓库通过 GitHub Actions 构建 GHCR 镜像，并在单机宿主机上自动拉取镜像部署的场景。

对应入口：

- CI/CD 工作流：`.github/workflows/ci.yml`
- 发布 Compose：`deploy/docker-compose.github.yml`
- 部署命令：`bash deploy.sh release`

## 2. 前置条件

### 2.1 GitHub 仓库侧

- 仓库已启用 GitHub Actions
- 仓库管理员有权配置 Secrets / Environments / Branch protection
- 仓库所在组织或个人账号允许使用 GHCR

### 2.2 部署机侧

- 已安装 Docker Engine 与 Docker Compose v2
- 部署用户已加入 `docker` 组
- 服务器上已存在当前仓库工作目录，例如 `${DEPLOY_PATH}`
- `deploy/.env` 已按目标环境填写完成

## 3. GitHub 配置

### 3.1 Actions 权限

在仓库 `Settings -> Actions -> General` 中确认：

- Actions 允许执行
- Workflow permissions 至少允许读取仓库内容
- 当前 workflow 使用的 `packages: write` 权限未被组织策略拦截

### 3.2 Secrets

在 `Settings -> Secrets and variables -> Actions` 或 `Environment: production` 中配置：

- `DEPLOY_HOST`：部署机地址
- `DEPLOY_USER`：SSH 登录用户
- `DEPLOY_SSH_KEY`：SSH 私钥
- `DEPLOY_PATH`：服务器仓库根目录
- `GHCR_USERNAME`：用于拉取 GHCR 镜像的账号
- `GHCR_TOKEN`：用于拉取 GHCR 镜像的令牌，至少需要 `read:packages`

建议做法：

- 与生产部署直接相关的变量放到 `production` Environment
- 在 `production` Environment 上增加人工审批，避免误发版

### 3.3 分支保护

建议在 `Settings -> Branches` 中给当前默认分支 `master` 增加保护规则；如果未来分支改名为 `main`，同步迁移保护规则。至少要求：

- `Backend Build & Test`
- `Frontend Build & Type Check`

通过后再允许合并。

## 4. 部署机配置

### 4.1 初始化仓库

首次部署前在服务器上准备仓库目录：

```bash
git clone <your-repo-url> /path/to/firefly-iot
cd /path/to/firefly-iot/deploy
cp .env.example .env
```

按目标环境填写 `.env` 中的数据库、Redis、Kafka、Nacos、MinIO、ZLMediaKit、JWT 等参数。

### 4.2 初始化基础设施配置

首次自动部署前，建议先在服务器手工执行一次：

```bash
cd /path/to/firefly-iot/deploy
bash deploy.sh infra
```

这样可以提前完成：

- external volume 创建
- `deploy/runtime/zlmediakit/config.ini` 生成
- PostgreSQL / Redis / Kafka / Nacos / MinIO / Sentinel / ZLMediaKit 首次拉起

虽然 `bash deploy.sh release` 本身也会做这些准备，但首次手工执行更便于排查 `.env` 配置问题。

## 5. 发布流程

### 5.1 日常 CI

- 推送到当前默认分支 `master`、兼容分支 `main`、`develop`
- 创建或更新指向 `master`、`main`、`develop` 的 Pull Request

会自动执行：

- Maven `clean verify`
- 前端 `npm ci`
- `tsc --noEmit`
- 前端构建

### 5.2 正式发布

发布命令示例：

```bash
git tag v1.0.0
git push origin v1.0.0
```

工作流会自动执行：

1. 构建并推送业务镜像到 GHCR
2. SSH 登录部署机
3. `git fetch origin --tags`
4. `git checkout v1.0.0`
5. `cd deploy && bash deploy.sh release`

## 6. 回滚方式

若发布后需要回滚，直接重新发布旧标签或补打新的回滚标签即可。

示例：

```bash
git push origin v0.9.5
```

或在服务器手工执行：

```bash
cd /path/to/firefly-iot
git fetch origin --tags
git checkout v0.9.5
cd deploy
APP_IMAGE_NAMESPACE=<owner>/<repo> APP_IMAGE_TAG=v0.9.5 bash deploy.sh release
```

## 7. 监控与验收

部署完成后至少检查：

- `http://<host>/`
- `http://<host>:8080/actuator/health`
- `http://<host>:9030/actuator/health`
- `docker ps`
- `docker logs firefly-gateway --tail 100`
- `docker logs firefly-web --tail 100`

`deploy.sh release` 已内置基础设施和应用健康检查，脚本返回成功后才代表核心入口可访问。

## 8. 常见故障

### 8.1 GHCR 拉取失败

常见原因：

- `GHCR_USERNAME` / `GHCR_TOKEN` 缺失
- `GHCR_TOKEN` 没有 `read:packages`
- GHCR 包仍是私有，但该账号没有对应仓库的包读取权限

排查方式：

```bash
docker login ghcr.io
docker pull ghcr.io/<owner>/<repo>/firefly-gateway:v1.0.0
```

### 8.2 `APP_IMAGE_NAMESPACE is required`

说明 `bash deploy.sh release` 执行时没有收到 `APP_IMAGE_NAMESPACE`。

排查顺序：

1. 看 workflow deploy job 是否通过 `envs:` 透传了环境变量
2. 看 SSH 登录后 shell 是否拿到了对应变量
3. 手工复验 `echo "$APP_IMAGE_NAMESPACE"`

### 8.3 服务器找不到 `deploy/runtime/zlmediakit/config.ini`

说明当前宿主机尚未生成运行时配置。执行：

```bash
cd /path/to/firefly-iot/deploy
bash deploy.sh infra
```

### 8.4 外部卷不存在

说明是首次部署且还没创建 external volume。执行：

```bash
cd /path/to/firefly-iot/deploy
bash deploy.sh infra
```

或直接重试：

```bash
bash deploy.sh release
```

### 8.5 服务器仓库处于 detached HEAD

这是当前发布链路的预期行为，因为部署目标是准确切到对应发布标签。后续如果需要更新部署脚本或 `.env`，先切回主分支再操作：

```bash
git checkout master
git pull --ff-only origin master
```
