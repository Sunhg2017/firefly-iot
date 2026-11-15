# 自定义看板 / 运营大屏运维说明

## 1. 部署方式

- `firefly-data` 首次启用 Flyway（此前 `enabled=false`），独立历史表 `flyway_data_history`，`V1__init_custom_dashboard.sql` 建 `custom_dashboards`。
- `firefly-system` 新增 `V44__add_custom_dashboard_permission.sql`，为既有 `dashboard` 菜单补 `dashboard:manage` 权限并授权预设角色。
- 无新增中间件；部署时按 `deploy/deploy.sh up` 正常滚动即可。

## 2. 首次启用 Flyway 的注意事项

`firefly-data` 与 system/device/rule/media 共享同一 PostgreSQL 库，但各用独立 Flyway 历史表（`flyway_data_history`），因此启用后 Flyway 会对既有库执行 `baseline-on-migrate`（基线 0）后仅应用 `V1` 建表，不会触碰其他服务的表。

> 建议在联调环境先验证一次：确认 `flyway_data_history` 只记录 baseline + V1，`custom_dashboards` 正常创建。

## 3. 权限

- 读取：`dashboard:read`（既有）。
- 管理（创建/编辑/删除/分享）：`dashboard:manage`（新增，V44 已授权预设系统角色）。
- 若自定义角色需管理看板，在角色权限中勾选「管理自定义看板」。

## 4. 常见故障与排查

| 现象 | 可能原因 | 处置 |
| --- | --- | --- |
| 看板列表报「缺少租户上下文」 | 请求未走认证链路 | 确认经网关且带 JWT |
| 保存看板报「找不到符号/建表失败」 | Flyway 未执行 | 查 `firefly-data` 启动日志与 `flyway_data_history` |
| 分享链接打不开 | 令牌无效或非本租户 | 分享仅限租户内，需同租户账号登录 |

## 5. 回滚

- 该能力为增量新增；回退 `firefly-data` 镜像并删除 `custom_dashboards` 表与 `flyway_data_history` 中 V1 记录即可，不影响工作台既有 5 个统计视图。
