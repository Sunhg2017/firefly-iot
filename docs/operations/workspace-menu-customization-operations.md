# 工作空间菜单配置运维说明

## 1. 部署范围

本功能涉及：

- `firefly-system`：新增菜单配置表、接口、权限资源和默认授权迁移。
- `firefly-web`：新增菜单配置页面，布局切换为动态菜单树。

上线前需确保同时发布后端与前端。

## 2. 数据库变更

新增 Flyway：

- `V25__init_workspace_menu_customizations.sql`

迁移内容：

- 创建 `workspace_menu_customizations`。
- 初始化 `menu-customization:*` 权限资源。
- 向 `workspace_menu_catalog`、`workspace_menu_permission_catalog` 插入菜单配置入口。
- 给系统超级管理员、历史租户管理员补齐菜单配置权限。
- 给历史租户补齐 `tenant_menu_configs.menu_key='menu-customization'`。

## 3. 依赖与配置

无新增外部中间件依赖。

依赖现有能力：

- `workspace_menu_catalog`
- `workspace_menu_permission_catalog`
- `tenant_menu_configs`
- `permission_resources`
- `role_permissions`

## 4. 启动与验证

建议验证顺序：

1. 启动后端，确认 Flyway 成功执行到 `V25`。
2. 使用系统运维管理员登录，访问 `/menu-customization`。
3. 使用租户管理员登录，访问 `/menu-customization`。
4. 修改菜单名称或层级后刷新页面，确认左侧导航与面包屑同步变化。

本次开发验证命令：

```bash
mvn -pl firefly-system -am -DskipTests compile
cd firefly-web
npm run build
```

## 5. 监控与日志

重点关注：

- Flyway 启动日志中 `V25__init_workspace_menu_customizations.sql`
- 后端 4xx 日志中的菜单配置校验失败
- 前端 `/workspace-menu-customizations/current/tree` 请求是否持续成功

涉及类：

- `WorkspaceMenuCustomizationService`
- `WorkspaceMenuCustomizationController`
- `TenantWorkspaceMenuService`

## 6. 常见问题排查

### 6.1 菜单配置页访问 403

检查项：

- 当前用户是否拥有 `menu-customization:read`
- 当前用户是否为系统超级管理员或租户超级管理员
- 当前租户是否已补齐 `tenant_menu_configs.menu_key='menu-customization'`

### 6.2 左侧菜单没有按新配置显示

检查项：

- `workspace_menu_customizations` 是否存在对应租户、空间、菜单键记录
- 前端是否成功请求 `/api/v1/workspace-menu-customizations/current/tree`
- 当前用户是否具备该菜单绑定的页面权限

### 6.3 保存时报“不能移动到自己的后代下”

原因：

- 当前菜单被配置成挂到自己的子树节点下，后端循环校验阻止保存。

处理：

- 重新选择父级目录。

### 6.4 历史菜单层级异常或节点消失

原因：

- 历史配置中的 `parent_menu_key` 已不在当前可配置集合中，或者基础菜单键发生了调整。

处理：

- 删除对应 `workspace_menu_customizations` 记录后重试。
- 如果基础菜单结构发生了大的重构，应同步清理失效个性化配置。

## 7. 回滚方案

回滚顺序：

1. 回滚前端版本，避免继续访问新接口。
2. 回滚后端版本。
3. 如需彻底回退数据，可删除：
   - `workspace_menu_customizations`
   - `workspace_menu_catalog` 中 `menu_key='menu-customization'` 的记录
   - `workspace_menu_permission_catalog` 中 `menu_key='menu-customization'` 的记录
   - `permission_resources` 中 `menu-customization:*`
   - `role_permissions` 中 `menu-customization:*`
   - `tenant_menu_configs` 中 `menu_key='menu-customization'`

注意：

- 若仅回滚代码、不回滚数据，遗留数据不会影响旧功能主流程，但新入口会失效。
