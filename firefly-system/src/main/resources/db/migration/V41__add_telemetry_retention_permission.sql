-- ============================================================
-- 时序数据治理：设备数据菜单新增保留策略权限点
-- ============================================================

-- 1. 菜单权限目录
INSERT INTO workspace_menu_permission_catalog (
    workspace_scope,
    menu_key,
    permission_code,
    permission_label,
    permission_sort_order
) VALUES (
    'TENANT',
    'device-data',
    'data:retention',
    '设置数据保留',
    20
)
ON CONFLICT (workspace_scope, menu_key, permission_code) DO UPDATE
SET permission_label = EXCLUDED.permission_label,
    permission_sort_order = EXCLUDED.permission_sort_order,
    updated_at = CURRENT_TIMESTAMP;

-- 2. 权限资源（设备数据菜单 + 保留策略按钮）
DO $$
DECLARE
    v_data_read_id BIGINT;
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
        'data:read',
        '设备数据',
        'MENU',
        'LineChartOutlined',
        '/device-data',
        355,
        TRUE,
        '查看设备遥测、事件与降采样数据'
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
    RETURNING id INTO v_data_read_id;

    IF v_data_read_id IS NULL THEN
        SELECT id
        INTO v_data_read_id
        FROM permission_resources
        WHERE code = 'data:read'
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
    ) VALUES (
        v_data_read_id,
        'data:retention',
        '设置数据保留',
        'BUTTON',
        '/api/v1/device-data/retention',
        1,
        TRUE,
        '设置或重置当前租户时序数据保留天数'
    )
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

-- 3. 预设系统角色授权
INSERT INTO role_permissions (role_id, permission, created_at)
SELECT r.id, 'data:retention', now()
FROM roles r
WHERE r.type = 'PRESET'
  AND r.is_system = TRUE
ON CONFLICT (role_id, permission) DO NOTHING;
