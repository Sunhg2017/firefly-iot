-- ============================================================
-- Converge tenant video menu into device assets. Video asset
-- management reuses device CRUD, while media control permissions
-- stay under the device menu.
-- ============================================================

DELETE FROM workspace_menu_permission_catalog
WHERE workspace_scope = 'TENANT'
  AND menu_key = 'video';

DELETE FROM workspace_menu_catalog
WHERE workspace_scope = 'TENANT'
  AND menu_key = 'video';

DELETE FROM workspace_menu_customizations
WHERE workspace_scope = 'TENANT'
  AND (menu_key = 'video' OR parent_menu_key = 'video');

DELETE FROM tenant_menu_configs
WHERE menu_key = 'video';

DELETE FROM workspace_menu_permission_catalog
WHERE workspace_scope = 'TENANT'
  AND menu_key = 'device'
  AND permission_code IN ('video:create', 'video:update', 'video:delete');

INSERT INTO workspace_menu_permission_catalog (
    workspace_scope,
    menu_key,
    permission_code,
    permission_label,
    permission_sort_order
) VALUES
    ('TENANT', 'device', 'device:create', '创建设备资产', 10),
    ('TENANT', 'device', 'device:read', '查看设备资产', 20),
    ('TENANT', 'device', 'device:update', '编辑设备资产', 30),
    ('TENANT', 'device', 'device:delete', '删除设备资产', 40),
    ('TENANT', 'device', 'device:control', '控制设备', 50),
    ('TENANT', 'device', 'device:debug', '调试设备', 60),
    ('TENANT', 'device', 'device:import', '导入设备', 70),
    ('TENANT', 'device', 'device:export', '导出设备', 80),
    ('TENANT', 'device', 'video:read', '查看视频控制', 90),
    ('TENANT', 'device', 'video:stream', '视频流控制', 100),
    ('TENANT', 'device', 'video:ptz', '云台控制', 110),
    ('TENANT', 'device', 'video:record', '录像控制', 120)
ON CONFLICT (workspace_scope, menu_key, permission_code) DO UPDATE
SET permission_label = EXCLUDED.permission_label,
    permission_sort_order = EXCLUDED.permission_sort_order,
    updated_at = CURRENT_TIMESTAMP;
