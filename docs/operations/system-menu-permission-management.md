# 系统菜单权限台账运维说明

## 1. 发布检查

确认 `firefly-system` 已执行到：

- `V24__rebuild_workspace_menu_catalog.sql`
- `V33__backfill_device_assets_menu_icon.sql`
- `V35__converge_video_permissions_to_device_menu.sql`

## 2. 验证 SQL

```sql
select * from workspace_menu_catalog
where workspace_scope = 'TENANT' and menu_key in ('device', 'video');

select * from workspace_menu_permission_catalog
where workspace_scope = 'TENANT' and menu_key = 'device'
order by permission_sort_order;
```

预期结果：

- `TENANT/video` 不存在
- `TENANT/device` 下存在 `video:read / video:stream / video:ptz / video:record`

## 3. 常见问题

### 3.1 菜单目录里还有 video

排查：

1. 检查 `V35` 是否执行
2. 检查是否手工回灌过旧菜单数据
3. 检查是否还有残留 `workspace_menu_customizations` 和 `tenant_menu_configs`

### 3.2 授权目录里没有视频控制权限

排查：

1. 检查 `workspace_menu_permission_catalog` 中 `TENANT/device` 绑定
2. 检查角色是否重新分配了 `video:*` 控制权限
