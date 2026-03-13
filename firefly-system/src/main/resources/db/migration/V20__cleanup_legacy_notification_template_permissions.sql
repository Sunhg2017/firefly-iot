-- ============================================================
-- Remove legacy notification-template permission remnants and
-- register dedicated notification/message-template permission groups.
-- ============================================================

DO $$
DECLARE
    v_notification_read_id BIGINT;
    v_message_template_read_id BIGINT;
BEGIN
    INSERT INTO permission_groups (code, name, permissions, sort_order)
    VALUES
        ('SYSTEM', '系统设置', '["system:config"]', 12),
        ('NOTIFICATION', '通知中心', '["notification:read","notification:update","notification:delete"]', 15),
        ('MESSAGE_TEMPLATE', '消息模板', '["message-template:create","message-template:read","message-template:update","message-template:delete"]', 16)
    ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        permissions = EXCLUDED.permissions,
        sort_order = EXCLUDED.sort_order;

    INSERT INTO role_permissions (role_id, permission, created_at)
    SELECT legacy.role_id, mapped.permission, now()
    FROM (
        SELECT DISTINCT role_id
        FROM role_permissions
        WHERE permission = 'system:notification'
    ) legacy
    CROSS JOIN (
        VALUES
            ('message-template:create'),
            ('message-template:read'),
            ('message-template:update'),
            ('message-template:delete')
    ) AS mapped(permission)
    ON CONFLICT (role_id, permission) DO NOTHING;

    DELETE FROM role_permissions
    WHERE permission = 'system:notification';

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
        'notification:read',
        '通知中心',
        'MENU',
        'BellOutlined',
        '/notification',
        36,
        TRUE,
        '查看通知渠道与发送记录页面'
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
        updated_at = now()
    RETURNING id INTO v_notification_read_id;

    IF v_notification_read_id IS NULL THEN
        SELECT id
        INTO v_notification_read_id
        FROM permission_resources
        WHERE code = 'notification:read';
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
        (
            v_notification_read_id,
            'notification:update',
            '维护通知渠道',
            'BUTTON',
            '/api/v1/notifications/channels',
            1,
            TRUE,
            '创建、编辑、启停和测试通知渠道'
        ),
        (
            v_notification_read_id,
            'notification:delete',
            '删除通知渠道',
            'BUTTON',
            '/api/v1/notifications/channels/{id}',
            2,
            TRUE,
            '删除通知渠道'
        )
    ON CONFLICT (code) DO UPDATE
    SET parent_id = EXCLUDED.parent_id,
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        path = EXCLUDED.path,
        sort_order = EXCLUDED.sort_order,
        enabled = EXCLUDED.enabled,
        description = EXCLUDED.description,
        updated_at = now();

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
        'message-template:read',
        '消息模板',
        'MENU',
        'MessageOutlined',
        '/message-template',
        37,
        TRUE,
        '查看消息模板页面'
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
        updated_at = now()
    RETURNING id INTO v_message_template_read_id;

    IF v_message_template_read_id IS NULL THEN
        SELECT id
        INTO v_message_template_read_id
        FROM permission_resources
        WHERE code = 'message-template:read';
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
        (
            v_message_template_read_id,
            'message-template:create',
            '创建消息模板',
            'BUTTON',
            '/api/v1/message-templates',
            1,
            TRUE,
            '创建消息模板'
        ),
        (
            v_message_template_read_id,
            'message-template:update',
            '编辑消息模板',
            'BUTTON',
            '/api/v1/message-templates/{id}',
            2,
            TRUE,
            '编辑或启停消息模板'
        ),
        (
            v_message_template_read_id,
            'message-template:delete',
            '删除消息模板',
            'BUTTON',
            '/api/v1/message-templates/{id}',
            3,
            TRUE,
            '删除消息模板'
        )
    ON CONFLICT (code) DO UPDATE
    SET parent_id = EXCLUDED.parent_id,
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        path = EXCLUDED.path,
        sort_order = EXCLUDED.sort_order,
        enabled = EXCLUDED.enabled,
        description = EXCLUDED.description,
        updated_at = now();
END $$;
