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
    'device-topology',
    'tenant-device-assets',
    '设备拓扑',
    'ApartmentOutlined',
    '/device-topology',
    'PAGE',
    15,
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
) VALUES (
    'TENANT',
    'device-topology',
    'device:read',
    '查看设备拓扑',
    10
)
ON CONFLICT (workspace_scope, menu_key, permission_code) DO UPDATE
SET permission_label = EXCLUDED.permission_label,
    permission_sort_order = EXCLUDED.permission_sort_order,
    updated_at = CURRENT_TIMESTAMP;
