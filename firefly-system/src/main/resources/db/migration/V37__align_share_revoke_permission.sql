-- ============================================================
-- Align cross-tenant share permissions with the runtime API.
-- Revoke is now a dedicated permission instead of reusing
-- share:update, and the share permission group is normalized.
-- ============================================================

INSERT INTO workspace_menu_permission_catalog (
    workspace_scope,
    menu_key,
    permission_code,
    permission_label,
    permission_sort_order
) VALUES (
    'TENANT',
    'share',
    'share:revoke',
    '撤销共享策略',
    60
)
ON CONFLICT (workspace_scope, menu_key, permission_code) DO UPDATE
SET permission_label = EXCLUDED.permission_label,
    permission_sort_order = EXCLUDED.permission_sort_order,
    updated_at = CURRENT_TIMESTAMP;

DO $$
DECLARE
    v_share_read_id BIGINT;
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
        'share:read',
        '跨租户共享',
        'MENU',
        'ShareAltOutlined',
        '/share',
        210,
        TRUE,
        '查看跨租户共享策略、共享设备和共享审计日志'
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
    RETURNING id INTO v_share_read_id;

    IF v_share_read_id IS NULL THEN
        SELECT id
        INTO v_share_read_id
        FROM permission_resources
        WHERE code = 'share:read'
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
        (v_share_read_id, 'share:create', '创建共享策略', 'BUTTON', '/api/v1/share-policies', 1, TRUE, '创建新的跨租户共享策略'),
        (v_share_read_id, 'share:update', '编辑共享策略', 'BUTTON', '/api/v1/share-policies', 2, TRUE, '编辑尚未生效的共享策略'),
        (v_share_read_id, 'share:delete', '删除共享策略', 'BUTTON', '/api/v1/share-policies', 3, TRUE, '删除未生效的共享策略'),
        (v_share_read_id, 'share:approve', '审批共享策略', 'BUTTON', '/api/v1/share-policies/*/approve', 4, TRUE, '审批或驳回共享策略'),
        (v_share_read_id, 'share:revoke', '撤销共享策略', 'BUTTON', '/api/v1/share-policies/*/revoke', 5, TRUE, '撤销已生效的共享策略')
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

UPDATE permission_groups
SET permissions = '["share:create","share:read","share:update","share:delete","share:approve","share:revoke"]'
WHERE code = 'SHARE';

INSERT INTO role_permissions (role_id, permission, created_at)
SELECT DISTINCT rp.role_id, 'share:revoke', NOW()
FROM role_permissions rp
WHERE rp.permission IN ('share:update', 'share:approve', 'share:*')
ON CONFLICT DO NOTHING;
