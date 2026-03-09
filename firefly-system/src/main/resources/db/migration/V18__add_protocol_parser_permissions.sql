-- ============================================================
-- Add protocol parser permissions, resources, and admin grants.
-- ============================================================

DO $$
DECLARE
    v_protocol_parser_read_id BIGINT;
    v_system_config RECORD;
    v_default_permissions TEXT[];
BEGIN
    INSERT INTO permission_groups (code, name, permissions, sort_order)
    VALUES (
        'PROTOCOL_PARSER',
        '协议解析',
        '["protocol-parser:create","protocol-parser:read","protocol-parser:update","protocol-parser:test","protocol-parser:publish"]',
        14
    )
    ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        permissions = EXCLUDED.permissions,
        sort_order = EXCLUDED.sort_order;

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
        'protocol-parser:read',
        '协议解析',
        'MENU',
        'ApiOutlined',
        '/protocol-parser',
        35,
        TRUE,
        '查看协议解析页面'
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
    RETURNING id INTO v_protocol_parser_read_id;

    IF v_protocol_parser_read_id IS NULL THEN
        SELECT id
        INTO v_protocol_parser_read_id
        FROM permission_resources
        WHERE code = 'protocol-parser:read';
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
            v_protocol_parser_read_id,
            'protocol-parser:create',
            '创建协议解析',
            'BUTTON',
            '/api/v1/protocol-parsers',
            1,
            TRUE,
            '创建协议解析定义'
        ),
        (
            v_protocol_parser_read_id,
            'protocol-parser:update',
            '编辑协议解析',
            'BUTTON',
            '/api/v1/protocol-parsers/{id}',
            2,
            TRUE,
            '编辑、启用或停用协议解析定义'
        ),
        (
            v_protocol_parser_read_id,
            'protocol-parser:test',
            '调试协议解析',
            'BUTTON',
            '/api/v1/protocol-parsers/{id}/test',
            3,
            TRUE,
            '调试执行协议解析定义'
        ),
        (
            v_protocol_parser_read_id,
            'protocol-parser:publish',
            '发布协议解析',
            'BUTTON',
            '/api/v1/protocol-parsers/{id}/publish',
            4,
            TRUE,
            '发布或回滚协议解析定义版本'
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

    INSERT INTO role_permissions (role_id, permission, created_at)
    SELECT r.id, 'protocol-parser:*', now()
    FROM roles r
    WHERE r.type = 'PRESET'
      AND r.is_system = TRUE
    ON CONFLICT (role_id, permission) DO NOTHING;

    INSERT INTO tenant_menu_configs (
        tenant_id,
        parent_id,
        menu_key,
        label,
        icon,
        route_path,
        sort_order,
        visible,
        created_by,
        created_at,
        updated_at
    )
    SELECT
        product_menu.tenant_id,
        product_menu.parent_id,
        '/protocol-parser',
        '协议解析',
        'ApiOutlined',
        '/protocol-parser',
        COALESCE((
            SELECT MAX(sibling.sort_order) + 1
            FROM tenant_menu_configs sibling
            WHERE sibling.tenant_id = product_menu.tenant_id
              AND sibling.parent_id = product_menu.parent_id
        ), product_menu.sort_order + 1),
        product_menu.visible,
        product_menu.created_by,
        now(),
        now()
    FROM tenant_menu_configs product_menu
    WHERE product_menu.menu_key = '/product'
      AND NOT EXISTS (
          SELECT 1
          FROM tenant_menu_configs existing
          WHERE existing.tenant_id = product_menu.tenant_id
            AND existing.menu_key = '/protocol-parser'
      );

    FOR v_system_config IN
        SELECT id, config_value, value_type
        FROM system_configs
        WHERE config_key = 'tenant.admin.default-permissions'
          AND value_type = 'JSON'
    LOOP
        BEGIN
            SELECT ARRAY(
                SELECT permission
                FROM (
                    SELECT DISTINCT permission
                    FROM jsonb_array_elements_text(v_system_config.config_value::jsonb) AS permission
                    UNION
                    SELECT 'protocol-parser:*'
                ) AS permissions
                ORDER BY permission
            )
            INTO v_default_permissions;

            UPDATE system_configs
            SET config_group = COALESCE(NULLIF(config_group, ''), 'platform'),
                config_value = to_jsonb(v_default_permissions)::TEXT,
                value_type = 'JSON',
                description = COALESCE(NULLIF(description, ''), '新租户管理员默认权限(JSON数组)'),
                updated_at = now()
            WHERE id = v_system_config.id;
        EXCEPTION
            WHEN OTHERS THEN
                NULL;
        END;
    END LOOP;
END $$;
