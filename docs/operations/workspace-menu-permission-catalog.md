# 工作空间菜单权限目录运维说明

## 1. 适用范围

本说明适用于以下能力：

- 工作空间菜单权限台账表
- 角色授权目录读取台账
- 运维空间查看菜单、权限点与所属空间关系

## 2. 涉及模块

- `firefly-system`
- `firefly-web`

## 3. 发布内容

本次发布包含：

- 新表 `workspace_menu_permission_catalog`
- 当前系统菜单权限关系初始化数据
- 运维只读接口 `/api/v1/workspace-permission-catalog`
- 权限资源页面新增“空间权限目录”标签页
- `WorkspacePermissionCatalogService` 改为读取数据库台账

## 4. 发布步骤

1. 发布 `firefly-system`
2. 发布 `firefly-web`
3. 确认 Flyway 已执行 `V23__init_workspace_menu_permission_catalog.sql`

## 5. 发布后检查

### 5.1 数据表检查

```sql
select count(*) from workspace_menu_permission_catalog;

select workspace_scope, module_key, menu_path, permission_code
from workspace_menu_permission_catalog
order by workspace_scope, module_sort_order, permission_sort_order;
```

### 5.2 页面检查

运维空间进入：

`权限资源 -> 空间权限目录`

重点确认：

- 能看到系统运维空间记录
- 能看到租户业务空间记录
- 同一共享功能在两个空间各有一条记录集

### 5.3 角色授权检查

1. 打开系统运维空间角色管理
2. 打开租户空间角色管理
3. 对比不同工作空间的可授权权限目录
4. 确认租户空间只出现该租户已授权菜单对应的权限点

## 6. 后续功能变更的 SQL 维护要求

新增或调整功能时，必须同步增加 Flyway SQL 维护台账：

- 只属于租户空间：
  - 写一条 `TENANT` 记录
- 只属于系统运维空间：
  - 写一条 `PLATFORM` 记录
- 两个空间共有：
  - 分别写两条记录

推荐模板：

```sql
INSERT INTO workspace_menu_permission_catalog (
    workspace_scope,
    module_key,
    module_label,
    menu_path,
    permission_code,
    permission_label,
    module_sort_order,
    permission_sort_order,
    role_catalog_visible
) VALUES (
    'TENANT',
    'example-module',
    '示例功能',
    '/example',
    'example:read',
    '查看示例功能',
    999,
    10,
    TRUE
)
ON CONFLICT (workspace_scope, module_key, permission_code) DO UPDATE
SET module_label = EXCLUDED.module_label,
    menu_path = EXCLUDED.menu_path,
    permission_label = EXCLUDED.permission_label,
    module_sort_order = EXCLUDED.module_sort_order,
    permission_sort_order = EXCLUDED.permission_sort_order,
    role_catalog_visible = EXCLUDED.role_catalog_visible,
    updated_at = CURRENT_TIMESTAMP;
```

## 7. 常见问题

### 7.1 运维页面能看到菜单，但角色页没有该模块

优先检查：

- `role_catalog_visible` 是否为 `FALSE`
- 当前工作空间是否就是该记录所属空间
- 租户空间是否真的授权了该 `menu_path`

### 7.2 租户角色选到了不该有的权限

优先检查：

- `tenant_menu_configs` 是否还保留了超范围旧菜单授权
- 台账表是否误把平台功能写成了租户记录
- 角色权限缓存是否已经刷新

### 7.3 新功能页面已经可见，但台账没有记录

说明发布不完整，需要补一条新的 Flyway SQL，而不是手工直接改数据库。

## 8. 回滚说明

如需回滚版本：

- 允许保留 `workspace_menu_permission_catalog` 表，不影响旧数据读取
- 但不建议回滚到再度依赖硬编码目录的实现
- 若确需回滚，必须明确旧版本不会识别新台账页面与最新目录
