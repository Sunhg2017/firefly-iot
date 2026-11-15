-- ============================================================
-- 自定义看板：新增 dashboard:manage 权限台账
-- （复用既有 dashboard 菜单，不新增菜单/icon/路由）
-- ============================================================

INSERT INTO workspace_menu_permission_catalog (
    workspace_scope, menu_key, permission_code, permission_label, permission_sort_order
) VALUES
    ('PLATFORM', 'dashboard', 'dashboard:manage', '管理自定义看板', 20),
    ('TENANT', 'dashboard', 'dashboard:manage', '管理自定义看板', 20)
ON CONFLICT (workspace_scope, menu_key, permission_code) DO UPDATE
SET permission_label = EXCLUDED.permission_label,
    permission_sort_order = EXCLUDED.permission_sort_order,
    updated_at = CURRENT_TIMESTAMP;

DO $$
DECLARE
    v_read_id BIGINT;
BEGIN
    SELECT id INTO v_read_id FROM permission_resources WHERE code = 'dashboard:read' LIMIT 1;

    IF v_read_id IS NOT NULL THEN
        INSERT INTO permission_resources (
            parent_id, code, name, type, path, sort_order, enabled, description
        ) VALUES (
            v_read_id, 'dashboard:manage', '管理自定义看板', 'BUTTON', '/api/v1/dashboard/custom', 20, TRUE,
            '创建、编辑、删除自定义看板并管理分享'
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
    END IF;
END $$;

INSERT INTO role_permissions (role_id, permission, created_at)
SELECT r.id, 'dashboard:manage', now()
FROM roles r
WHERE r.type = 'PRESET'
  AND r.is_system = TRUE
ON CONFLICT (role_id, permission) DO NOTHING;
