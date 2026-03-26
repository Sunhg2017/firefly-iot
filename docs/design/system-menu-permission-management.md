# 系统菜单权限台账设计

## 1. 目标

- 菜单结构、权限目录、Flyway 台账保持一致。
- 视频设备并入 `device` 菜单后，不再保留独立 `video` 菜单记录。

## 2. 当前口径

### 2.1 菜单

- 租户空间保留 `device` 菜单
- 删除租户空间独立 `video` 菜单

### 2.2 权限

`device` 菜单下统一维护：

- `device:create`
- `device:read`
- `device:update`
- `device:delete`
- `device:control`
- `device:debug`
- `device:import`
- `device:export`
- `video:read`
- `video:stream`
- `video:ptz`
- `video:record`

## 3. 迁移要求

必须执行：

- `V24__rebuild_workspace_menu_catalog.sql`
- `V33__backfill_device_assets_menu_icon.sql`
- `V35__converge_video_permissions_to_device_menu.sql`

其中 `V35` 负责：

- 删除 `workspace_menu_catalog` 中的 `TENANT/video`
- 删除 `workspace_menu_permission_catalog` 中 `video` 菜单旧绑定
- 清理 `workspace_menu_customizations` 和 `tenant_menu_configs` 中的旧 `video` 数据
- 将视频控制权限挂到 `device` 菜单下
