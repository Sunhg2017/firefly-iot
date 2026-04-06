# 租户套餐与配额能力下线运维说明

> 模块: firefly-system / firefly-web / firefly-common
> 日期: 2026-04-06
> 状态: Done

## 1. 发布内容

- 删除租户套餐、配额相关前后端接口和页面入口。
- 执行数据库迁移 `V38__remove_tenant_plan_and_quota.sql`。
- 清理租户权限分组中的 `tenant:quota`、`tenant:billing` 残留。

## 2. 发布要求

1. 先执行后端数据库迁移，确认 `V38` 成功。
2. 再发布 `firefly-system` 与 `firefly-web` 最新版本。
3. 发布后清理浏览器缓存或前端静态资源缓存，避免用户看到旧页面按钮。

## 3. 数据检查

- 确认 `tenants` 表已不存在 `plan` 列。
- 确认 `tenant_quotas` 表已删除。
- 确认 `permission_groups` 中 `TENANT` 分组权限已收口为 `["tenant:read","tenant:manage"]`。

如运维侧仍有依赖 `tenant_quotas` 的历史脚本、报表或 SQL，请在发布前一并下线，不再保留兼容数据结构。

## 4. 验证步骤

执行：

```bash
mvn -pl firefly-system -am test

cd firefly-web
npm run build
```

回归检查：

1. 打开“租户管理”，确认列表无套餐筛选、套餐列、套餐概览卡片。
2. 打开任一普通租户的“更多”菜单，确认不再出现“调整套餐”“调整配额”。
3. 创建租户时，确认表单只保留隔离级别，不再要求选择套餐。
4. 访问租户自助接口时，确认只保留 `/api/v1/tenant`、`/api/v1/tenant/usage`、`/api/v1/tenant/usage/daily`。

## 5. 常见问题

### 5.1 页面还看到套餐/配额入口

- 优先确认前端静态资源是否已经更新。
- 清理浏览器缓存后重新登录。

### 5.2 Flyway 迁移失败

- 检查数据库中是否存在占用 `tenant_quotas` 的外部对象或手工脚本。
- 检查当前环境是否已经部分人工删除过 `plan` 字段或相关索引。

## 6. 回滚说明

本次为结构性删除，不建议仅回滚前端或仅回滚后端。

如必须回滚，需要同时回退：

- `firefly-system`
- `firefly-web`
- `firefly-common`
- `V38__remove_tenant_plan_and_quota.sql` 之后的数据库状态

并重新恢复 `tenants.plan`、`tenant_quotas` 以及旧权限配置。
