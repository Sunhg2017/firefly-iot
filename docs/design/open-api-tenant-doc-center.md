# 租户 OpenAPI 文档中心设计

## 1. 背景

租户空间已经具备 `AppKey 管理` 能力，但在 OpenAPI 数量增加后，租户侧缺少一份可直接查阅的接口说明页。现状存在两个明显问题：

- 租户只能在订阅页或 AppKey 授权页看到接口名称、方法和地址，无法直接查看入参、出参、字段说明与调用示例。
- 右上角没有统一入口，用户需要先进入 `AppKey 管理`，再结合别的页面或后端 Swagger 自行拼接调用方式，学习成本高。

本次改造在不新增租户菜单、不新增权限台账的前提下，把租户 OpenAPI 文档能力直接收口到既有 `/app-key` 页面内，通过标签页和头部按钮完成入口统一。

## 2. 目标与范围

### 2.1 目标

- 在租户空间提供一个按服务分组的 OpenAPI 文档页。
- 文档页展示当前租户已订阅且已启用的 OpenAPI。
- 每个接口展示：
  - 网关调用地址
  - HTTP 方法
  - 入参字段说明
  - 出参字段说明
  - 请求示例
  - 响应示例
  - curl 示例
- 在租户空间右上角增加“接口文档”按钮，点击后直接进入文档页。

### 2.2 非目标

- 不新增租户菜单、权限点、Flyway 菜单台账。
- 不直接让前端去访问各服务 `/v3/api-docs`。
- 不为旧的单接口按钮式交互保留双轨逻辑。

## 3. 总体方案

### 3.1 路由与入口

- 复用租户已有路由 `/app-key`。
- 通过查询参数区分视图：
  - `/app-key` 或 `/app-key?tab=appkey`：AppKey 管理
  - `/app-key?tab=docs`：OpenAPI 文档
- 租户空间 `BasicLayout` 头部右侧新增“接口文档”按钮，点击后跳转到 `/app-key?tab=docs`。

这样可以避开新路由在 `authorizedMenuPaths` 体系下无法访问的问题，也无需新增菜单基础数据。

### 3.2 文档数据源

- 文档目录来源仍然是 `open_api_catalog` 与租户订阅关系。
- 请求/响应模型、字段说明、示例来源于各微服务自身的 `springdoc-openapi /v3/api-docs`。
- 系统服务新增租户文档聚合服务，由它统一：
  - 根据当前租户找出已订阅 OpenAPI
  - 按 `serviceCode` 分组
  - 通过注册中心定位对应微服务实例
  - 拉取微服务 `/v3/api-docs`
  - 解析匹配的 path + method
  - 生成字段列表、示例和 curl 模板

### 3.3 新增接口

- `GET /api/v1/app-keys/open-api-docs`

返回内容包括：

- 文档生成时间
- 签名算法与 Canonical Request 模板
- 鉴权请求头说明
- 按服务分组的接口文档列表

## 4. 后端设计

### 4.1 新增 DTO

位于 `firefly-system/src/main/java/com/songhg/firefly/iot/system/dto/openapi/`

- `TenantOpenApiDocVO`
- `TenantOpenApiDocServiceVO`
- `TenantOpenApiDocItemVO`
- `TenantOpenApiDocFieldVO`
- `TenantOpenApiDocAuthHeaderVO`

### 4.2 新增服务

新增 `TenantOpenApiDocService`，核心职责：

1. 读取当前租户已订阅且已启用的 OpenAPI。
2. 通过 `DiscoveryClient` 根据 `serviceCode` 找到微服务实例。
3. 拉取服务 `http://{instance}/v3/api-docs`。
4. 使用 Jackson 解析 OpenAPI JSON：
   - 解析 `paths`
   - 解析 `parameters`
   - 解析 `requestBody`
   - 解析 `responses`
   - 解析 `#/components/*` 引用
5. 将 schema 拍平成字段路径：
   - 对象字段使用 `data.name`
   - 数组字段使用 `items[].name`
   - map 字段使用 `properties.*`
6. 生成默认示例与 curl 模板。

### 4.3 缓存策略

- 使用 Caffeine 在系统服务内缓存各服务 `/v3/api-docs` 解析结果。
- 缓存维度：`serviceCode`
- 过期时间：5 分钟
- 目标：避免租户频繁打开文档页时重复拉取大体积 OpenAPI JSON。

### 4.4 异常处理

- 如果某个服务的 `/v3/api-docs` 暂不可用，不中断整个文档页。
- 页面仍展示该服务已订阅的接口目录、网关地址与提示信息。
- 仅该服务分组显示“服务文档暂不可用”告警。

## 5. 前端设计

### 5.1 页面结构

`ApiKeyPage` 改为两个标签页：

- `AppKey 管理`
- `接口文档`

其中：

- `ApiKeyManagerTab.tsx` 承载原 AppKey 管理能力
- `OpenApiDocsTab.tsx` 承载文档能力

### 5.2 文档页交互

文档页包含以下区块：

1. 调用说明
   - 鉴权请求头
   - 签名原文模板
   - 网关调用口径
2. 筛选区
   - 关键字搜索
   - 服务筛选
3. 服务分组列表
   - 每个服务一个卡片
   - 卡片内表格展示接口摘要
   - 行展开后查看完整文档

### 5.3 行展开内容

每个接口展开后显示：

- 基本信息
- 路径/查询/业务请求头参数
- 请求体字段
- 响应字段
- 请求示例
- 响应示例
- curl 调用示例

## 6. 关键取舍

### 6.1 为什么不新建菜单

- 当前租户空间权限收口到菜单路径。
- 新增隐藏路由会被 `authorizedMenuPaths` 拦截。
- 复用 `/app-key` 可以避免额外 Flyway 菜单数据和授权改造。

### 6.2 为什么由系统服务聚合，而不是前端直连各服务

- 前端无法直接通过网关访问 `/v3/api-docs`。
- 前端直连会暴露内部服务地址和服务发现细节。
- 系统服务更适合统一过滤“当前租户可调用的接口”。

### 6.3 为什么采用拍平字段路径

- OpenAPI schema 存在 `$ref`、`allOf`、数组和嵌套对象。
- 若直接把 schema 原样下发，前端还需再做一轮复杂解析。
- 拍平后前端只需渲染表格即可，交互更稳定。

## 7. 风险与后续项

- 如果某些控制器未补充足够的 Swagger 注解，字段描述可能为空，只能回退到自动推断。
- 如果服务未注册到 Nacos 或 `/v3/api-docs` 被关闭，对应服务分组只能展示基础目录信息。
- 当前 curl 示例使用占位符，不代替真实签名工具；后续可再补 SDK 示例或语言模板。
