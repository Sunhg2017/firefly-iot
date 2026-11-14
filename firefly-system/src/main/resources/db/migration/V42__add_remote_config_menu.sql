-- ============================================================
-- 远程配置菜单与权限台账
-- ============================================================

INSERT INTO workspace_menu_catalog (
    workspace_scope, menu_key, parent_menu_key, label, icon, route_path,
    menu_type, sort_order, visible, role_catalog_visible
) VALUES (
    'TENANT', 'remote-config', 'tenant-device-assets', '远程配置', 'ControlOutlined', '/remote-config',
    'PAGE', 70, TRUE, TRUE
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
    workspace_scope, menu_key, permission_code, permission_label, permission_sort_order
) VALUES
    ('TENANT', 'remote-config', 'remote-config:read', '查看远程配置', 10),
    ('TENANT', 'remote-config', 'remote-config:create', '创建远程配置', 20),
    ('TENANT', 'remote-config', 'remote-config:update', '编辑远程配置', 30),
    ('TENANT', 'remote-config', 'remote-config:delete', '删除远程配置', 40),
    ('TENANT', 'remote-config', 'remote-config:deploy', '下发远程配置', 50)
ON CONFLICT (workspace_scope, menu_key, permission_code) DO UPDATE
SET permission_label = EXCLUDED.permission_label,
    permission_sort_order = EXCLUDED.permission_sort_order,
    updated_at = CURRENT_TIMESTAMP;

DO $$
DECLARE
    v_read_id BIGINT;
BEGIN
    INSERT INTO permission_resources (
        parent_id, code, name, type, icon, path, sort_order, enabled, description
    ) VALUES (
        0, 'remote-config:read', '远程配置', 'MENU', 'ControlOutlined', '/remote-config', 365, TRUE,
        '查看设备远程配置模板、版本与下发记录'
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
    RETURNING id INTO v_read_id;

    IF v_read_id IS NULL THEN
        SELECT id INTO v_read_id FROM permission_resources WHERE code = 'remote-config:read' LIMIT 1;
    END IF;

    INSERT INTO permission_resources (
        parent_id, code, name, type, path, sort_order, enabled, description
    ) VALUES
        (v_read_id, 'remote-config:create', '创建远程配置', 'BUTTON', '/api/v1/remote-configs', 1, TRUE, '创建远程配置模板'),
        (v_read_id, 'remote-config:update', '编辑远程配置', 'BUTTON', '/api/v1/remote-configs/{id}', 2, TRUE, '编辑、发布、回滚或停用配置'),
        (v_read_id, 'remote-config:delete', '删除远程配置', 'BUTTON', '/api/v1/remote-configs/{id}', 3, TRUE, '删除远程配置'),
        (v_read_id, 'remote-config:deploy', '下发远程配置', 'BUTTON', '/api/v1/remote-configs/{id}/deploy', 4, TRUE, '按产品/分组/设备下发配置')
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
SELECT r.id, 'remote-config:*', now()
FROM roles r
WHERE r.type = 'PRESET'
  AND r.is_system = TRUE
ON CONFLICT (role_id, permission) DO NOTHING;
