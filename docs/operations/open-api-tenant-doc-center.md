# 租户 OpenAPI 文档中心运维说明

## 1. 适用范围

本文适用于租户空间 `/app-key?tab=docs` OpenAPI 文档中心的部署、联调、故障排查与回滚。

## 2. 运行依赖

### 2.1 系统服务依赖

- `firefly-system`
- `spring-cloud-starter-loadbalancer`
- `spring-cloud-starter-alibaba-nacos-discovery`
- `springdoc-openapi`

### 2.2 被聚合服务依赖

以下服务需要在线且暴露 `/v3/api-docs`：

- `firefly-system`
- `firefly-device`
- `firefly-data`
- `firefly-rule`
- `firefly-support`
- `firefly-media`
- `firefly-connector`

## 3. 部署检查项

### 3.1 服务在线检查

确认目标微服务已经注册到 Nacos，并且实例可访问。

建议检查：

- Nacos 中是否存在 `firefly-system`、`firefly-device` 等实例
- 对应服务访问 `http://{host}:{port}/v3/api-docs` 是否返回 JSON

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

## 5. 缓存说明

- 系统服务对各服务的 OpenAPI 文档做了 5 分钟本地缓存。
- 如果代码已更新但页面仍显示旧文档，可等待缓存过期或重启 `firefly-system`。

## 6. 常见故障与排查

### 6.1 页面提示“服务文档暂不可用”

排查顺序：

1. 确认对应微服务实例是否在线。
2. 确认 `/v3/api-docs` 没有被网关或安全规则拦截。
3. 查看 `firefly-system` 日志中 `Failed to load tenant OpenAPI docs` 相关告警。

### 6.2 页面有目录但没有字段说明

可能原因：

- 接口在 `open_api_catalog` 中存在，但服务 `OpenAPI` 文档尚未刷新
- 控制器或 DTO 缺少 Swagger 注解，导致 `summary/description/example` 不完整
- 接口 path 或 method 与自动注册目录不一致

建议排查：

1. 检查 `open_api_catalog.path_pattern` 是否与服务 `paths` 一致。
2. 检查目标接口方法的 Swagger 注解和 DTO `@Schema`。

### 6.3 文档页没有任何接口

排查：

1. 确认当前租户已订阅 OpenAPI。
2. 确认订阅的接口仍处于启用状态。
3. 确认登录账号具备 `appkey:read` 权限，并且菜单授权包含 `/app-key`。

## 7. 回滚方式

本次改造未引入数据库结构变更，也未新增菜单台账。

回滚可按以下顺序执行：

1. 回滚 `firefly-system` 到旧版本，移除租户文档聚合接口。
2. 回滚 `firefly-web` 到旧版本，恢复单页 `AppKey 管理`。

回滚影响：

- `/app-key?tab=docs` 将不再可用
- 右上角“接口文档”按钮应随前端版本回滚一起消失

## 8. 日志关注点

建议关注 `firefly-system` 中以下日志：

- `Failed to load tenant OpenAPI docs for serviceCode=...`

若需要快速定位问题，优先结合：

- 服务注册状态
- `/v3/api-docs` 原始响应
- 当前租户订阅列表
