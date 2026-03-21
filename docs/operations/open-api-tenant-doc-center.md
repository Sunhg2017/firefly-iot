# 租户 OpenAPI 文档中心运维说明

## 1. 适用范围

本文适用于租户空间 `/app-key?tab=docs` OpenAPI 文档中心的部署、联调、故障排查与回滚。

## 2. 运行依赖

### 2.1 系统服务依赖

- `firefly-system`
- `spring-cloud-starter-alibaba-nacos-discovery`
- `springdoc-openapi`
- PostgreSQL 中的 `open_api_service_docs` 表

### 2.2 被聚合服务依赖

以下服务需要在“同步 OpenAPI 文件”时可用并暴露 `/v3/api-docs`：

- `firefly-system`
- `firefly-device`
- `firefly-data`
- `firefly-rule`
- `firefly-support`
- `firefly-media`
- `firefly-connector`

说明：

- 租户查看文档时，不依赖上述服务当前是否在线。
- 页面读取的是系统服务库中最近一次成功同步的 OpenAPI 文件快照。

## 3. 部署检查项

### 3.1 首次同步检查

确认目标微服务已经注册到 Nacos，并能在启动后的自动注册周期内把最新 OpenAPI 文件同步到系统服务。

建议检查：

- Nacos 中是否存在 `firefly-system`、`firefly-device` 等实例
- 对应服务访问 `http://{host}:{port}/v3/api-docs` 是否返回 JSON
- `firefly-system.open_api_service_docs` 表中是否存在对应 `service_code` 记录

### 3.2 编译检查

后端：

```bash
mvn -pl firefly-system -am -DskipTests compile
```

前端：

```bash
cd firefly-web
npm run build
```

## 4. 页面验证

登录租户空间后，验证以下行为：

1. 头部右上角显示“接口文档”按钮。
2. 点击按钮后跳转到 `/app-key?tab=docs`。
3. 页面可按服务分组展示当前租户已订阅接口。
4. 展开接口行后可看到地址、字段说明、请求示例与响应示例。
5. 返回 `/app-key` 后仍可正常管理 AppKey。
6. 当目标微服务离线后，页面仍可查看最近一次同步成功的文档内容。

## 5. 快照说明

- 系统服务持久化保存各服务最近一次同步成功的 OpenAPI 文件。
- 数据来源于各微服务自动注册时一并上报的 `apiDocJson`。
- 如果代码已更新但页面仍显示旧文档，应先确认该服务是否已经完成新的自动同步，而不是检查页面缓存。

## 6. 常见故障与排查

### 6.1 页面提示“服务文档暂不可用”

排查顺序：

1. 确认 `open_api_service_docs` 中是否存在该服务的快照记录。
2. 如无记录，确认对应微服务实例是否在线。
3. 确认该服务本地 `/v3/api-docs` 没有被关闭或拦截。
4. 查看服务自身日志中的 `OpenAPI registration sync` 相关日志。
5. 查看 `firefly-system` 日志中 OpenAPI 文件解析失败相关告警。

### 6.2 页面有目录但没有字段说明

可能原因：

- 接口在 `open_api_catalog` 中存在，但系统里保存的 OpenAPI 文件还是旧版本
- 控制器或 DTO 缺少 Swagger 注解，导致 `summary/description/example` 不完整
- 接口 path 或 method 与自动注册目录不一致

建议排查：

1. 检查 `open_api_catalog.path_pattern` 是否与服务 `paths` 一致。
2. 检查 `open_api_service_docs.api_doc_json` 中是否包含该 path + method。
3. 检查目标接口方法的 Swagger 注解和 DTO `@Schema`。

### 6.3 文档页没有任何接口

排查：

1. 确认当前租户已订阅 OpenAPI。
2. 确认订阅的接口仍处于启用状态。
3. 确认登录账号具备 `appkey:read` 权限，并且菜单授权包含 `/app-key`。

## 7. 回滚方式

本次改造新增了 `open_api_service_docs` 表，但未新增菜单台账。

回滚可按以下顺序执行：

1. 回滚 `firefly-system` 到旧版本，移除租户文档聚合接口与快照读取逻辑。
2. 回滚 `firefly-web` 到旧版本，恢复单页 `AppKey 管理`。
3. 如需清理数据库，再手工删除 `open_api_service_docs` 表中的快照数据。

回滚影响：

- `/app-key?tab=docs` 将不再可用
- 右上角“接口文档”按钮应随前端版本回滚一起消失

## 8. 日志关注点

建议关注 `firefly-system` 中以下日志：

- OpenAPI 文件解析失败相关日志

若需要快速定位问题，优先结合：

- 自动注册同步日志
- `/v3/api-docs` 原始响应
- `open_api_service_docs` 快照内容
- 当前租户订阅列表
