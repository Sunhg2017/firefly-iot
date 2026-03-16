# 工作空间菜单配置设计

## 1. 背景

当前系统已经具备两类菜单基础能力：

- 系统运维空间通过 `workspace_menu_catalog` 维护平台基础菜单目录。
- 租户空间通过 `tenant_menu_configs` 维护本租户已授权菜单集合。

但两类空间都缺少“当前管理员按本空间实际使用习惯调整菜单显示名称、层级和排序”的能力，导致：

- 系统运维租户无法按内部运维口径重命名菜单。
- 租户管理员无法按本租户业务术语调整菜单结构。
- 前端菜单长期以静态路由树为准，无法消费后端实际配置。

## 2. 目标

- 为系统运维空间和租户空间提供统一的菜单个性化配置能力。
- 仅允许调整当前空间下菜单的显示名称、父级层级和排序。
- 不突破现有菜单授权和权限边界。
- 前端左侧菜单与面包屑统一切换为后端动态菜单树。

## 3. 范围

### 3.1 本次包含

- 新增菜单个性化配置表 `workspace_menu_customizations`。
- 新增当前空间菜单配置接口。
- 新增前端“菜单配置”页面。
- 左侧导航与面包屑改为消费当前用户生效菜单树。
- 新增 `menu-customization:read`、`menu-customization:update` 权限资源。
- 更新 `workspace_menu_permission_catalog`、`workspace_menu_catalog` 与默认授权数据。

### 3.2 本次不包含

- 不支持新增自定义菜单节点。
- 不支持修改菜单图标、路由、可见性和权限绑定。
- 不支持跨空间配置菜单。

## 4. 核心设计

## 4.1 数据模型

新增表：`workspace_menu_customizations`

关键字段：

- `tenant_id`：配置所属租户。系统运维空间使用系统运维租户 ID。
- `workspace_scope`：`PLATFORM` 或 `TENANT`。
- `menu_key`：被配置菜单的业务唯一键。
- `parent_menu_key`：自定义父级菜单键，允许为空表示顶级。
- `label`：自定义显示名称。
- `sort_order`：自定义排序。
- `updated_by`：最后修改人。

设计约束：

- `tenant_id + workspace_scope + menu_key` 唯一。
- 仅保存差异配置；当名称、父级、排序均回到基础菜单默认值时，删除自定义记录。

## 4.2 生效规则

### 系统运维空间

- 基础菜单来源：`workspace_menu_catalog` 中 `workspace_scope=PLATFORM` 且可见的页面菜单。
- 个性化配置归属：系统运维租户。
- 可配置人员：系统超级管理员。

### 租户空间

- 基础菜单来源：`workspace_menu_catalog` 中 `workspace_scope=TENANT`。
- 可配置范围：仅当前租户已授权菜单及其祖先目录。
- 个性化配置归属：当前租户。
- 可配置人员：租户超级管理员。

### 当前用户菜单树

- 先按工作空间判定基础页面菜单集合。
- 再根据当前用户权限过滤出可访问页面。
- 再补齐祖先目录。
- 最后叠加 `workspace_menu_customizations` 得到生效树。

## 4.3 校验规则

- 父级菜单必须存在于当前可配置菜单集合中。
- 父级菜单必须是目录节点，不能挂到页面节点下。
- 菜单不能设置自己为父级。
- 菜单不能移动到自己的后代下面，防止循环引用。
- 对历史失效自定义关系，读取时自动降级到安全父级，写入时严格校验。

## 4.4 前端渲染

- `BasicLayout` 不再以静态路由树作为菜单显示源。
- 左侧菜单、展开路径、面包屑统一使用 `/api/v1/workspace-menu-customizations/current/tree` 返回的动态树。
- 路由本身、403 校验、首页跳转仍继续使用现有静态路由和权限判断，避免影响页面注册逻辑。

## 5. 接口设计

## 5.1 当前用户菜单树

- `GET /api/v1/workspace-menu-customizations/current/tree`
- 用途：布局加载当前用户当前空间的生效菜单树。

## 5.2 当前管理员可配置菜单树

- `GET /api/v1/workspace-menu-customizations/current/manage/tree`
- 权限：`menu-customization:read`
- 额外校验：系统超级管理员或租户超级管理员。

## 5.3 更新当前空间菜单配置

- `PUT /api/v1/workspace-menu-customizations/current/menus/{menuKey}`
- 权限：`menu-customization:update`
- 请求体：
  - `label`
  - `parentMenuKey`
  - `sortOrder`

## 5.4 重置单个菜单为默认配置

- `DELETE /api/v1/workspace-menu-customizations/current/menus/{menuKey}`
- 权限：`menu-customization:update`

## 6. 权限与菜单台账

新增菜单：

- `PLATFORM / menu-customization / /menu-customization`
- `TENANT / menu-customization / /menu-customization`

新增权限：

- `menu-customization:read`
- `menu-customization:update`

台账更新：

- `workspace_menu_catalog` 新增系统运维空间、租户空间各一条菜单记录。
- `workspace_menu_permission_catalog` 新增两空间共四条权限绑定记录。

## 7. 默认授权策略

- 系统运维内置角色 `system_super_admin` 自动追加 `menu-customization:*`。
- 历史租户管理员角色自动追加 `menu-customization:*`。
- 历史租户 `tenant_menu_configs` 自动补齐 `menu-customization`。
- 运行时 `TenantWorkspaceMenuService` 也会强制补齐 `menu-customization`，避免历史数据缺口导致入口丢失。

## 8. 风险与取舍

- 取舍一：不允许新建自定义目录节点，避免在基础菜单目录之外形成第二套菜单体系。
- 取舍二：菜单展示改为动态树，但路由注册继续保留静态定义，降低前端改造范围。
- 风险一：历史自定义父级可能失效。处理方式是读取时自动回退到默认父级。
- 风险二：如果后续基础菜单 `menu_key` 变更，原个性化配置会失效。运维需清理对应旧配置记录。
