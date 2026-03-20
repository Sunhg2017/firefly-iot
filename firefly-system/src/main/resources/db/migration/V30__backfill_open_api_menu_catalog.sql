-- ============================================================
-- Backfill OpenAPI/AppKey workspace menu catalog data for
-- environments that already executed older OpenAPI migrations.
-- ============================================================

DELETE FROM role_permissions
WHERE permission IN ('openapi:create', 'openapi:update', 'openapi:delete');

DELETE FROM workspace_menu_permission_catalog
WHERE workspace_scope = 'PLATFORM'
  AND menu_key = 'open-api'
  AND permission_code IN ('openapi:create', 'openapi:update', 'openapi:delete');

DELETE FROM permission_resources
WHERE code IN ('openapi:create', 'openapi:update', 'openapi:delete');

DELETE FROM role_permissions
WHERE permission LIKE 'apikey:%';

DELETE FROM workspace_menu_permission_catalog
WHERE menu_key = 'api-key'
   OR permission_code LIKE 'apikey:%';

DELETE FROM workspace_menu_customizations
WHERE menu_key = 'api-key';

DELETE FROM tenant_menu_configs
WHERE menu_key = 'api-key';

DELETE FROM workspace_menu_catalog
WHERE menu_key = 'api-key';

DELETE FROM permission_resources
WHERE code LIKE 'apikey:%';

DO $$
DECLARE
    v_open_api_read_id BIGINT;
    v_app_key_read_id BIGINT;
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
        'openapi:read',
        'OpenAPI 目录',
        'MENU',
        'ApiOutlined',
        '/open-api',
        57,
        TRUE,
        '查看由各微服务 @OpenApi 自动注册的 OpenAPI 目录'
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
    RETURNING id INTO v_open_api_read_id;

    IF v_open_api_read_id IS NULL THEN
        SELECT id
        INTO v_open_api_read_id
        FROM permission_resources
        WHERE code = 'openapi:read'
        LIMIT 1;
    END IF;

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
        'appkey:read',
        'AppKey 管理',
        'MENU',
        'KeyOutlined',
        '/app-key',
        58,
        TRUE,
        '查看租户空间中的 AppKey 列表'
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
    RETURNING id INTO v_app_key_read_id;

    IF v_app_key_read_id IS NULL THEN
        SELECT id
        INTO v_app_key_read_id
        FROM permission_resources
        WHERE code = 'appkey:read'
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
        (v_app_key_read_id, 'appkey:create', '创建 AppKey', 'BUTTON', '/api/v1/app-keys', 10, TRUE, '创建租户 AppKey'),
        (v_app_key_read_id, 'appkey:update', '编辑 AppKey', 'BUTTON', '/api/v1/app-keys/{id}', 20, TRUE, '编辑租户 AppKey'),
        (v_app_key_read_id, 'appkey:delete', '删除 AppKey', 'BUTTON', '/api/v1/app-keys/{id}', 30, TRUE, '删除租户 AppKey')
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

INSERT INTO workspace_menu_catalog (
    workspace_scope,
    menu_key,
    parent_menu_key,
    label,
    icon,
    route_path,
    menu_type,
    sort_order,
    visible,
    role_catalog_visible
) VALUES
    ('PLATFORM', 'open-api', 'platform-system-ops', 'OpenAPI 管理', 'ApiOutlined', '/open-api', 'PAGE', 15, TRUE, TRUE),
    ('TENANT', 'app-key', 'tenant-identity-access', 'AppKey 管理', 'KeyOutlined', '/app-key', 'PAGE', 25, TRUE, TRUE)
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
    workspace_scope,
    menu_key,
    permission_code,
    permission_label,
    permission_sort_order
) VALUES
    ('PLATFORM', 'open-api', 'openapi:read', '查看 OpenAPI 目录', 10),
    ('TENANT', 'app-key', 'appkey:read', '查看 AppKey', 10),
    ('TENANT', 'app-key', 'appkey:create', '创建 AppKey', 20),
    ('TENANT', 'app-key', 'appkey:update', '编辑 AppKey', 30),
    ('TENANT', 'app-key', 'appkey:delete', '删除 AppKey', 40)
ON CONFLICT (workspace_scope, menu_key, permission_code) DO UPDATE
SET permission_label = EXCLUDED.permission_label,
    permission_sort_order = EXCLUDED.permission_sort_order,
    updated_at = CURRENT_TIMESTAMP;
