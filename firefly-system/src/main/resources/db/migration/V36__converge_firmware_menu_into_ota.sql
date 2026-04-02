-- ============================================================
-- Converge legacy firmware menu into the unified OTA workspace.
-- Remove the duplicate /firmware entry, align ota labels, and
-- collapse old firmware permissions into ota permissions.
-- ============================================================

DELETE FROM workspace_menu_permission_catalog
WHERE workspace_scope = 'TENANT'
  AND menu_key = 'firmware';

DELETE FROM workspace_menu_catalog
WHERE workspace_scope = 'TENANT'
  AND menu_key = 'firmware';

DELETE FROM workspace_menu_customizations
WHERE workspace_scope = 'TENANT'
  AND (menu_key = 'firmware' OR parent_menu_key = 'firmware');

DELETE FROM tenant_menu_configs
WHERE menu_key = 'firmware';

DELETE FROM permission_resources
WHERE code IN ('firmware:read', 'firmware:update');

UPDATE workspace_menu_catalog
SET label = 'OTA 与固件',
    sort_order = 10,
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_scope = 'TENANT'
  AND menu_key = 'ota';

DELETE FROM workspace_menu_permission_catalog
WHERE workspace_scope = 'TENANT'
  AND menu_key = 'ota';

INSERT INTO workspace_menu_permission_catalog (
    workspace_scope,
    menu_key,
    permission_code,
    permission_label,
    permission_sort_order
) VALUES
    ('TENANT', 'ota', 'ota:read', '查看 OTA 与固件', 10),
    ('TENANT', 'ota', 'ota:upload', '维护固件与设备版本', 20),
    ('TENANT', 'ota', 'ota:deploy', '创建升级任务', 30),
    ('TENANT', 'ota', 'ota:delete', '删除固件与任务', 40)
ON CONFLICT (workspace_scope, menu_key, permission_code) DO UPDATE
SET permission_label = EXCLUDED.permission_label,
    permission_sort_order = EXCLUDED.permission_sort_order,
    updated_at = CURRENT_TIMESTAMP;

DO $$
DECLARE
    v_ota_read_id BIGINT;
BEGIN
    INSERT INTO permission_resources (
        parent_id,
        code,
        name,
        type,
        icon,
        path,
        sort_order,
        enabled,
        description
    ) VALUES (
        0,
        'ota:read',
        'OTA 与固件',
        'MENU',
        'CloudUploadOutlined',
        '/ota',
        450,
        TRUE,
        '查看统一的固件库、设备版本与升级任务工作台'
    )
    ON CONFLICT (code) DO UPDATE
    SET parent_id = EXCLUDED.parent_id,
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        icon = EXCLUDED.icon,
        path = EXCLUDED.path,
        sort_order = EXCLUDED.sort_order,
        enabled = EXCLUDED.enabled,
        description = EXCLUDED.description,
        updated_at = NOW()
    RETURNING id INTO v_ota_read_id;

    IF v_ota_read_id IS NULL THEN
        SELECT id
        INTO v_ota_read_id
        FROM permission_resources
        WHERE code = 'ota:read'
        LIMIT 1;
    END IF;

    INSERT INTO permission_resources (
        parent_id,
        code,
        name,
        type,
        path,
        sort_order,
        enabled,
        description
    ) VALUES
        (v_ota_read_id, 'ota:upload', '维护固件与设备版本', 'BUTTON', '/api/v1/firmwares', 1, TRUE, '上传固件并维护设备固件版本登记'),
        (v_ota_read_id, 'ota:deploy', '创建升级任务', 'BUTTON', '/api/v1/ota-tasks', 2, TRUE, '创建、取消 OTA 升级任务'),
        (v_ota_read_id, 'ota:delete', '删除固件与任务', 'BUTTON', '/api/v1/firmwares', 3, TRUE, '删除草稿固件和升级任务')
    ON CONFLICT (code) DO UPDATE
    SET parent_id = EXCLUDED.parent_id,
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        path = EXCLUDED.path,
        sort_order = EXCLUDED.sort_order,
        enabled = EXCLUDED.enabled,
        description = EXCLUDED.description,
        updated_at = NOW();
END $$;

INSERT INTO role_permissions (role_id, permission, created_at)
SELECT DISTINCT rp.role_id, 'ota:read', NOW()
FROM role_permissions rp
WHERE rp.permission IN ('firmware:read', 'firmware:update')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission, created_at)
SELECT DISTINCT rp.role_id, 'ota:upload', NOW()
FROM role_permissions rp
WHERE rp.permission = 'firmware:update'
ON CONFLICT DO NOTHING;

DELETE FROM role_permissions
WHERE permission IN ('firmware:read', 'firmware:update');
