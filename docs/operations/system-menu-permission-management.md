# 系统菜单权限管理运维说明

## 适用范围

本文适用于以下模块的发布、巡检与排障：

1. `firefly-system`
2. `firefly-web`
3. 工作空间菜单目录与租户空间授权链路

## 发布内容

本次发布包含：

1. 新表 `workspace_menu_catalog`
2. 重建表 `workspace_menu_permission_catalog`
3. 重建表 `tenant_menu_configs`
4. 新权限资源：
   - `workspace-menu:read`
   - `workspace-menu:update`
5. 平台与租户基础菜单种子
6. 系统菜单权限管理页面
7. 运行时 `authorizedMenuPaths` 访问约束
8. 菜单图标必填校验与 `tenant-device-assets` 图标回填

## 发布步骤

1. 发布 `firefly-system`
2. 执行 Flyway 迁移到最新版本，至少包含 `V24__rebuild_workspace_menu_catalog.sql` 和 `V33__backfill_device_assets_menu_icon.sql`
3. 发布 `firefly-web`
4. 重新登录平台和租户账号验证菜单授权是否生效

## 发布前检查

1. 确认数据库允许执行 `DROP TABLE` 与重建索引。
2. 如果历史环境曾经手工改过租户菜单、旧目录接口或权限种子，建议先清理旧数据。
3. 如果当前环境尚未正式使用，建议直接清库后重跑迁移，避免旧脏数据影响菜单授权判断。
4. 如历史环境出现菜单名称正常但左侧无图标，优先确认 `workspace_menu_catalog.icon` 未被手工清空，并已执行到 `V33`。

## 发布后验证

### 数据库检查

```sql
select count(*) from workspace_menu_catalog;

select count(*) from workspace_menu_permission_catalog;

select workspace_scope, menu_key, label, icon, route_path, menu_type
from workspace_menu_catalog
order by workspace_scope, sort_order, menu_key;

select workspace_scope, menu_key, icon
from workspace_menu_catalog
where menu_key = 'tenant-device-assets';

select workspace_scope, menu_key, permission_code, permission_label
from workspace_menu_permission_catalog
order by workspace_scope, menu_key, permission_sort_order;
```

### 权限资源检查

```sql
select code, name, type, path
from permission_resources
where code in ('workspace-menu:read', 'workspace-menu:update');
```

### 租户授权检查

```sql
select tenant_id, menu_key
from tenant_menu_configs
order by tenant_id, menu_key;
```

## 功能验证

### 平台空间

1. 使用系统运维管理员登录。
2. 确认左侧出现 `用户与权限 -> 系统菜单权限`。
3. 打开页面后，平台与租户页签都能正常加载菜单树。
4. 新建菜单时，第一步必须选择图标后才能继续保存。

### 租户空间授权

1. 在租户管理列表打开某个租户的空间授权。
2. 勾掉某个租户页面菜单后保存。
3. 使用该租户管理员重新登录。
4. 验证该菜单从左侧消失，直接访问路由会进入 403。

### 角色权限目录

1. 打开平台或租户角色管理。
2. 查看权限目录是否跟随系统菜单权限配置变化。
3. 目录节点本身不应作为权限分组出现。

## 常见问题

### 1. 平台有权限，但看不到系统菜单权限入口

优先检查：

1. 当前账号是否属于系统运维空间。
2. 当前角色是否具备 `workspace-menu:read`。
3. `workspace_menu_catalog` 里是否存在 `PLATFORM/system-menu-permission` 记录。

### 2. 租户页面左侧隐藏了，但地址栏还能访问

正常情况下不应该出现。请检查：

1. 登录返回的 `authorizedMenuPaths` 是否包含该路由。
2. `tenant_menu_configs` 是否仍保留该菜单键。
3. 前端是否已刷新到最新构建版本。

### 3. 角色权限页没有出现某个页面的权限分组

检查：

1. 菜单节点是否是页面节点。
2. `role_catalog_visible` 是否为 `true`。
3. 菜单是否真正绑定了权限集合。
4. 租户空间下该菜单是否已授权给当前租户。

### 4. 迁移执行后菜单名称是乱码

说明迁移文件或数据库字符集未按 UTF-8 处理。请检查：

1. 仓库文件编码是否为 UTF-8。
2. 数据库连接参数是否正确传递字符集。
3. 如果已经写入脏数据，清理相关表后重新执行迁移。

### 5. 菜单名称正常，但图标不显示

请检查：

1. `workspace_menu_catalog.icon` 是否为空、拼错，或未与预期图标名一致。
2. 历史环境是否已执行 `V33__backfill_device_assets_menu_icon.sql`。
3. 前端 `firefly-web/src/config/iconMap.tsx` 是否已注册对应图标名称。

## 回滚说明

本次变更是模型重建，不建议回滚到旧实现。

如果必须回滚：

1. 回滚代码版本。
2. 手工恢复旧菜单授权模型和旧平面目录接口。
3. 重新初始化对应权限与租户菜单数据。

由于旧实现已被删除，回滚成本高于重新清理数据库并重建，优先建议重建环境。
