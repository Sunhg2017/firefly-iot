-- ============================================================
-- Move tenant video menu from ops tools to device assets and
-- repair historical tenant menu customizations that still point
-- to the old parent.
-- ============================================================

INSERT INTO workspace_menu_catalog (
    workspace_scope,
    menu_key,
    parent_menu_key,
    label,
    icon,
    route_path,
    menu_type,
    sort_order,
    visible,
    role_catalog_visible
) VALUES (
    'TENANT',
    'video',
    'tenant-device-assets',
    '视频监控',
    'VideoCameraOutlined',
    '/video',
    'PAGE',
    18,
    TRUE,
    TRUE
)
ON CONFLICT (workspace_scope, menu_key) DO UPDATE
SET parent_menu_key = EXCLUDED.parent_menu_key,
    label = EXCLUDED.label,
    icon = EXCLUDED.icon,
    route_path = EXCLUDED.route_path,
    menu_type = EXCLUDED.menu_type,
    sort_order = EXCLUDED.sort_order,
    visible = EXCLUDED.visible,
    role_catalog_visible = EXCLUDED.role_catalog_visible,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO workspace_menu_permission_catalog (
    workspace_scope,
    menu_key,
    permission_code,
    permission_label,
    permission_sort_order
) VALUES
    ('TENANT', 'video', 'video:create', '创建视频设备', 10),
    ('TENANT', 'video', 'video:read', '查看视频设备', 20),
    ('TENANT', 'video', 'video:update', '编辑视频设备', 30),
    ('TENANT', 'video', 'video:delete', '删除视频设备', 40),
    ('TENANT', 'video', 'video:stream', '视频流控制', 50),
    ('TENANT', 'video', 'video:ptz', '云台控制', 60),
    ('TENANT', 'video', 'video:record', '录像控制', 70)
ON CONFLICT (workspace_scope, menu_key, permission_code) DO UPDATE
SET permission_label = EXCLUDED.permission_label,
    permission_sort_order = EXCLUDED.permission_sort_order,
    updated_at = CURRENT_TIMESTAMP;

UPDATE workspace_menu_customizations
SET parent_menu_key = 'tenant-device-assets',
    sort_order = CASE WHEN sort_order = 30 THEN 18 ELSE sort_order END,
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_scope = 'TENANT'
  AND menu_key = 'video'
  AND parent_menu_key = 'tenant-ops-tools';
