# GitHub Actions CI/CD 使用说明

## 1. 适用角色

- 仓库管理员：负责配置 GitHub Actions、Secrets、Environment
- 发布负责人：负责打版本标签并观察发布结果
- 运维人员：负责准备部署机 `.env` 与验收部署结果

## 2. 第一次配置

### 2.1 配置 GitHub 仓库

进入仓库设置后完成以下操作：

1. 打开 `Settings -> Actions -> General`
2. 确认仓库允许执行 GitHub Actions
3. 在 `Settings -> Secrets and variables -> Actions` 或 `Environment: production` 中新增：
   - `DEPLOY_HOST`
   - `DEPLOY_USER`
   - `DEPLOY_SSH_KEY`
   - `DEPLOY_PATH`
   - `GHCR_USERNAME`
   - `GHCR_TOKEN`

### 2.2 配置部署机

在部署机上执行：

```bash
git clone <your-repo-url> /path/to/firefly-iot
cd /path/to/firefly-iot/deploy
cp .env.example .env
```

填写 `.env` 中的运行参数后，建议先执行一次：

```bash
bash deploy.sh infra
```

## 3. 日常使用

### 3.1 代码校验

当你：

- 推送代码到当前默认分支 `master`
- 推送代码到兼容分支 `main`
- 推送代码到 `develop`
- 创建或更新指向 `master`、`main`、`develop` 的 PR

GitHub 会自动运行 CI 校验，无需手工触发。

### 3.2 发版

需要正式发布时，在本地执行：

```bash
git tag v1.0.0
git push origin v1.0.0
```

发布后 GitHub Actions 会自动：

1. 构建后端与前端镜像
2. 推送到 GHCR
3. 连接服务器
4. 执行 `bash deploy.sh release`
5. 按标签版本拉取并部署业务镜像

## 4. 查看发布结果

### 4.1 GitHub 页面

进入仓库 `Actions` 页面，找到对应 `CI/CD` 工作流，重点关注：

- `Backend Build & Test`
- `Frontend Build & Type Check`
- `Build & Push Docker Images`
- `Build & Push Web Image`
- `Deploy to Production`

### 4.2 服务器验收

部署成功后可检查：

```bash
docker ps
curl -f http://localhost/
curl -f http://localhost:8080/actuator/health
curl -f http://localhost:9030/actuator/health
```

## 5. 手工补发

如果某次自动部署失败，但镜像已经成功推到 GHCR，可在服务器手工补发：

```bash
cd /path/to/firefly-iot
git fetch origin --tags
git checkout v1.0.0
cd deploy
APP_IMAGE_NAMESPACE=<owner>/<repo> APP_IMAGE_TAG=v1.0.0 bash deploy.sh release
```

如果 GHCR 包是私有的，再补充：

```bash
APP_IMAGE_REGISTRY_USERNAME=<user> APP_IMAGE_REGISTRY_PASSWORD=<token>
```

## 6. 注意事项

- 标签格式必须匹配 `v*`，例如 `v1.0.0`
- `GHCR_TOKEN` 至少需要 `read:packages`
- `deploy.sh release` 只负责拉取业务镜像，运行参数仍由部署机 `deploy/.env` 控制
- 服务器仓库切到发布标签后会处于 detached HEAD，这是当前发布口径的正常状态
