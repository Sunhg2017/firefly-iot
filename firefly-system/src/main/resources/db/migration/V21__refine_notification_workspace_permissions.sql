-- ============================================================
-- Refine notification permissions for workspace split:
-- platform manages channels, tenant workspace reads records.
-- ============================================================

DO $$
BEGIN
    INSERT INTO role_permissions (role_id, permission, created_at)
    SELECT r.id, 'notification:*', now()
    FROM roles r
    JOIN tenants t ON t.id = r.tenant_id
    WHERE t.code = 'system-ops'
      AND r.type = 'PRESET'
      AND r.is_system = TRUE
    ON CONFLICT (role_id, permission) DO NOTHING;

    UPDATE permission_groups
    SET name = '通知管理',
        permissions = '["notification:read","notification:update","notification:delete"]',
        sort_order = 15
    WHERE code = 'NOTIFICATION';

    UPDATE permission_resources
    SET name = '通知渠道',
        path = '/notification',
        description = '查看平台默认通知渠道页面',
        updated_at = now()
    WHERE code = 'notification:read';

    UPDATE permission_resources
    SET name = '维护通知渠道',
        description = '创建、编辑、启停和测试平台默认通知渠道',
        updated_at = now()
    WHERE code = 'notification:update';

    UPDATE permission_resources
    SET name = '删除通知渠道',
        description = '删除平台默认通知渠道',
        updated_at = now()
    WHERE code = 'notification:delete';
END $$;
