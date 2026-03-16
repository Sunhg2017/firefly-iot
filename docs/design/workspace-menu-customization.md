# 工作空间菜单配置设计

## 1. 背景

系统运维空间和租户空间都支持菜单名称、层级和排序的个性化配置，但租户空间可配置范围必须严格受系统运维授权约束。新租户如果尚未被系统运维分配任何租户空间菜单，不应自动看到全部租户菜单。

此前实现中，租户创建完成后会自动给新租户写入全部租户空间页面菜单授权，导致租户管理员首次登录时直接看到整套租户菜单，这与“租户空间菜单由系统运维显式分配”的授权模型冲突。

## 2. 目标

- 租户空间菜单以系统运维显式分配结果为唯一授权来源。
- 新租户创建后，不再自动授予全部租户空间菜单。
- 租户管理员只能自定义本租户已被授权的菜单，不允许越权看到未授权功能。
- 菜单显示、首页跳转、403 校验、权限分组保持统一收口。

## 3. 关键设计

### 3.1 授权来源

- 系统运维空间菜单来自 `workspace_menu_catalog` 中 `workspace_scope=PLATFORM` 的记录。
- 租户空间菜单来自 `workspace_menu_catalog` 中 `workspace_scope=TENANT` 的记录，但是否对某个租户生效，取决于 `tenant_menu_configs` 中的显式授权数据。
- 当前用户登录态中的 `authorizedMenuPaths` 由后端按租户实际授权菜单实时计算，不再依赖租户创建阶段的默认全量初始化。

### 3.2 新租户创建规则

- 创建租户时仅初始化租户、配额、管理员账号和管理员角色。
- 不再在租户创建流程中调用“默认授权全部租户菜单”逻辑。
- 租户管理员角色的初始权限只同步当前已授权菜单对应的权限集合。
- 如果系统运维尚未给该租户分配业务菜单，租户登录后不应看到未授权的租户业务菜单。

### 3.3 菜单配置与展示

- `WorkspaceMenuCustomizationService` 构建当前用户菜单树时，仅基于当前租户已授权的页面菜单和其祖先目录生成可见树。
- `WorkspacePermissionCatalogService` 仅允许对当前租户已授权菜单对应的权限做角色分配。
- 前端 `BasicLayout`、`workspaceRoutes.ts` 继续基于 `authorizedMenuPaths + permissions` 做页面可见性和首页决策。

## 4. 影响范围

- `firefly-system/src/main/java/com/songhg/firefly.iot.system.service.TenantService`
- `firefly-system/src/main/java/com/songhg/firefly.iot.system.service.TenantMenuConfigService`
- `firefly-system/src/main/java/com/songhg/firefly.iot.system.service.TenantWorkspaceMenuService`
- `firefly-system/src/main/java/com/songhg/firefly.iot.system.service.WorkspaceMenuAccessService`
- `firefly-system/src/main/java/com/songhg/firefly.iot.system.service.WorkspaceMenuCustomizationService`
- `firefly-web/src/layouts/BasicLayout.tsx`
- `firefly-web/src/config/workspaceRoutes.ts`

## 5. 默认授权策略

- 系统运维超级管理员仍保留平台侧完整菜单与权限。
- 租户侧不再存在“新租户自动获得全部租户菜单”的默认授权策略。
- 租户侧如需使用业务菜单，必须由系统运维在“租户管理 -> 空间授权”中显式勾选后生效。
- `menu-customization` 等必须保留的基础入口如有调整，应通过显式授权模型统一维护，禁止再引入“创建租户即全量授权”的兜底逻辑。

## 6. 风险与取舍

- 收口后，新租户在系统运维未完成空间授权前，租户管理员可见能力会明显变少，这是符合权限模型的预期，不再做兼容性放开。
- 如果历史库中仍残留旧租户的全量授权数据，需要运维按租户实际授权要求清理 `tenant_menu_configs`，而不是在代码里继续保留默认放开逻辑。
