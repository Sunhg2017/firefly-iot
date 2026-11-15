# 自定义看板 / 运营大屏设计说明

## 1. 背景与目标

`firefly-data` 的「工作台」此前固定渲染 5 个统计视图，租户无法按角色定制或保存多套看板（审计 P2-05）。本次补齐：

1. 租户可创建多套自定义看板，选择并保存展示组件布局。
2. 大屏（运营大屏）全屏预览。
3. 租户内分享（分享令牌）。

## 2. 范围

- 范围内：看板元数据与布局 JSON 的保存/编辑/删除/列表；内置组件目录（概览指标、最近告警、告警分布、设备产品分布、在线趋势）；全屏大屏预览；租户内分享。
- 范围外（已知限制）：
  - 不做拖拽式布局引擎（组件顺序由选择顺序决定，后端不解析布局内容）。
  - 不新增独立数据源引擎：组件数据复用既有 `dashboard/*` 数据接口。
  - 分享仅限租户内（读取时校验租户归属），不提供匿名公网分享（避免网关白名单改动）。

## 3. 架构

- `custom_dashboards` 表：存 `slug`（业务唯一键）、`name`、`description`、`layout`（JSON 文本）、`share_enabled`、`share_token`。
- 后端只做 CRUD + 分享，不解析 `layout`；前端按组件类型渲染并复用既有 `dashboardApi` 数据接口。
- 分享：开启时生成随机 `share_token`，读取时按「token + 租户归属」校验，防跨租户枚举。

## 4. 数据模型

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `slug` | VARCHAR(24) | 租户内唯一业务键，用于 URL |
| `name` / `description` | VARCHAR | 名称与说明 |
| `layout` | TEXT | 布局 JSON（组件数组） |
| `share_enabled` / `share_token` | BOOL / VARCHAR | 分享开关与令牌 |

约束：`uk_custom_dashboards_slug`（租户 + slug 唯一）；`uk_custom_dashboards_share_token`（share_token 唯一）。

## 5. 接口

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/dashboard/custom` | `dashboard:read` | 看板列表 |
| POST | `/api/v1/dashboard/custom` | `dashboard:manage` | 创建（返回 slug） |
| GET | `/api/v1/dashboard/custom/{slug}` | `dashboard:read` | 读取 |
| PUT | `/api/v1/dashboard/custom/{slug}` | `dashboard:manage` | 更新 |
| DELETE | `/api/v1/dashboard/custom/{slug}` | `dashboard:manage` | 删除 |
| POST | `/api/v1/dashboard/custom/{slug}/share?enabled=` | `dashboard:manage` | 开关分享 |
| GET | `/api/v1/dashboard/custom/share/{token}` | `dashboard:read` | 按令牌读取 |

## 6. 关键设计取舍

- **`slug` 作业务键**：不向前端暴露数据库自增主键。
- **layout 存 TEXT JSON**：避免为 JSONB 引入类型处理器，后端不解析内容，前端自由扩展组件。
- **新增 `dashboard:manage` 权限**：复用既有 `dashboard` 菜单，仅新增一条 BUTTON 级权限，不新增菜单/icon/路由。
- **分享仍租户内**：`getByShareToken` 额外校验 `tenant_id`，避免令牌被跨租户枚举；公网匿名分享作为后续扩展。

## 7. 风险与限制

1. `layout` 由前端生成，后端不校验组件类型与组合合法性；异常布局前端渲染时忽略。
2. 组件数据接口失败时大屏降级为空态，不阻塞其他组件。
3. firefly-data 首次启用 Flyway（`flyway_data_history` + `baseline-on-migrate`），需在联调环境验证基线不会误触既有表。
