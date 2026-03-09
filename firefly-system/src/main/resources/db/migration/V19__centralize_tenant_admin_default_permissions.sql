-- ============================================================
-- Centralize tenant admin default permissions into system_configs.
-- ============================================================

DO $$
DECLARE
    v_config_value TEXT;
    v_default_permissions TEXT[];
BEGIN
    SELECT sc.config_value
    INTO v_config_value
    FROM system_configs sc
    JOIN tenants t ON t.id = sc.tenant_id
    WHERE sc.config_key = 'tenant.admin.default-permissions'
      AND t.code = 'system-ops'
    ORDER BY sc.updated_at DESC NULLS LAST, sc.id DESC
    LIMIT 1;

    IF v_config_value IS NULL THEN
        SELECT sc.config_value
        INTO v_config_value
        FROM system_configs sc
        WHERE sc.tenant_id = 0
          AND sc.config_key = 'tenant.admin.default-permissions'
        ORDER BY sc.updated_at DESC NULLS LAST, sc.id DESC
        LIMIT 1;
    END IF;

    IF v_config_value IS NOT NULL THEN
        BEGIN
            SELECT ARRAY(
                SELECT permission
                FROM (
                    SELECT DISTINCT permission
                    FROM jsonb_array_elements_text(v_config_value::jsonb) AS permission
                    UNION
                    SELECT 'protocol-parser:*'
                ) AS permissions
                ORDER BY permission
            )
            INTO v_default_permissions;
        EXCEPTION
            WHEN OTHERS THEN
                v_default_permissions := ARRAY[
                    'dashboard:read',
                    'project:*',
                    'share:*',
                    'product:*',
                    'protocol-parser:*',
                    'device:*',
                    'device-group:*',
                    'device-tag:*',
                    'geo-fence:*',
                    'rule:*',
                    'alarm:*',
                    'notification:*',
                    'message-template:*',
                    'data:*',
                    'analysis:*',
                    'device-log:*',
                    'export:*',
                    'firmware:*',
                    'ota:*',
                    'video:*',
                    'monitor:read'
                ];
        END;
    ELSE
        v_default_permissions := ARRAY[
            'dashboard:read',
            'project:*',
            'share:*',
            'product:*',
            'protocol-parser:*',
            'device:*',
            'device-group:*',
            'device-tag:*',
            'geo-fence:*',
            'rule:*',
            'alarm:*',
            'notification:*',
            'message-template:*',
            'data:*',
            'analysis:*',
            'device-log:*',
            'export:*',
            'firmware:*',
            'ota:*',
            'video:*',
            'monitor:read'
        ];
    END IF;

    INSERT INTO system_configs (
        tenant_id,
        config_group,
        config_key,
        config_value,
        value_type,
        description,
        created_at,
        updated_at
    ) VALUES (
        0,
        'platform',
        'tenant.admin.default-permissions',
        to_jsonb(v_default_permissions)::TEXT,
        'JSON',
        '新租户管理员默认权限(JSON数组)',
        now(),
        now()
    )
    ON CONFLICT (tenant_id, config_key) DO UPDATE
    SET config_group = EXCLUDED.config_group,
        config_value = EXCLUDED.config_value,
        value_type = EXCLUDED.value_type,
        description = EXCLUDED.description,
        updated_at = now();

    DELETE FROM system_configs
    WHERE config_key = 'tenant.admin.default-permissions'
      AND tenant_id <> 0;
END $$;
