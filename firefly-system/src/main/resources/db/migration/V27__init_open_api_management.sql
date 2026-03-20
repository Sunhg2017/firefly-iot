-- ============================================================
-- OpenAPI catalog, tenant subscription, tenant appKey capability
-- ============================================================

CREATE TABLE IF NOT EXISTS open_api_catalog (
    id              BIGSERIAL PRIMARY KEY,
    code            VARCHAR(128) NOT NULL,
    name            VARCHAR(128) NOT NULL,
    service_code    VARCHAR(32) NOT NULL,
    http_method     VARCHAR(16) NOT NULL,
    path_pattern    VARCHAR(255) NOT NULL,
    permission_code VARCHAR(128),
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    description     TEXT,
    created_by      BIGINT,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_open_api_catalog_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_open_api_catalog_service_method
    ON open_api_catalog (service_code, http_method, enabled, sort_order);

COMMENT ON TABLE open_api_catalog IS '系统运维维护的 OpenAPI 目录';
COMMENT ON COLUMN open_api_catalog.code IS 'OpenAPI 业务唯一编码';
COMMENT ON COLUMN open_api_catalog.service_code IS '网关服务短码，如 SYSTEM/DEVICE';
COMMENT ON COLUMN open_api_catalog.http_method IS 'HTTP 方法';
COMMENT ON COLUMN open_api_catalog.path_pattern IS '下游服务路径模板，使用 /api/v1/** 口径';
COMMENT ON COLUMN open_api_catalog.permission_code IS '命中接口后透传给下游的权限码';

CREATE TABLE IF NOT EXISTS tenant_open_api_subscriptions (
    id                BIGSERIAL PRIMARY KEY,
    tenant_id         BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    open_api_code     VARCHAR(128) NOT NULL REFERENCES open_api_catalog(code) ON DELETE CASCADE,
    ip_whitelist      JSONB NOT NULL DEFAULT '[]',
    concurrency_limit INTEGER NOT NULL DEFAULT -1,
    daily_limit       BIGINT NOT NULL DEFAULT -1,
    created_by        BIGINT,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_tenant_open_api_subscription UNIQUE (tenant_id, open_api_code)
);

CREATE INDEX IF NOT EXISTS idx_tenant_open_api_subscription_tenant
    ON tenant_open_api_subscriptions (tenant_id, open_api_code);

COMMENT ON TABLE tenant_open_api_subscriptions IS '租户已订阅 OpenAPI 及其调用限制';
COMMENT ON COLUMN tenant_open_api_subscriptions.open_api_code IS '订阅的 OpenAPI 业务唯一编码';
COMMENT ON COLUMN tenant_open_api_subscriptions.ip_whitelist IS '允许调用的客户端 IP 白名单';
COMMENT ON COLUMN tenant_open_api_subscriptions.concurrency_limit IS '同一租户对单个 OpenAPI 的并发上限，-1 表示不限制';
COMMENT ON COLUMN tenant_open_api_subscriptions.daily_limit IS '同一租户对单个 OpenAPI 的单日调用上限，-1 表示不限制';

ALTER TABLE IF EXISTS api_access_logs
    ADD COLUMN IF NOT EXISTS open_api_code VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_api_access_logs_open_api
    ON api_access_logs (open_api_code, created_at DESC);

DELETE FROM role_permissions
WHERE permission LIKE 'apikey:%';

DELETE FROM workspace_menu_permission_catalog
WHERE menu_key = 'api-key'
   OR permission_code LIKE 'apikey:%';

DELETE FROM workspace_menu_customizations
WHERE menu_key = 'api-key';

DELETE FROM workspace_menu_catalog
WHERE menu_key = 'api-key';

DELETE FROM permission_resources
WHERE code LIKE 'apikey:%';

DO $$
DECLARE
    v_open_api_read_id BIGINT;
    v_app_key_read_id BIGINT;
    v_platform_tenant_id BIGINT;
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
        'OpenAPI 管理',
        'MENU',
        'ApiOutlined',
        '/open-api',
        57,
        TRUE,
        '查看系统运维空间的 OpenAPI 目录'
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
        path,
        sort_order,
        enabled,
        description
    ) VALUES
        (v_open_api_read_id, 'openapi:create', '创建 OpenAPI', 'BUTTON', '/api/v1/platform/open-apis', 10, TRUE, '创建 OpenAPI 目录项'),
        (v_open_api_read_id, 'openapi:update', '编辑 OpenAPI', 'BUTTON', '/api/v1/platform/open-apis/{code}', 20, TRUE, '编辑 OpenAPI 目录项'),
        (v_open_api_read_id, 'openapi:delete', '删除 OpenAPI', 'BUTTON', '/api/v1/platform/open-apis/{code}', 30, TRUE, '删除 OpenAPI 目录项')
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
        'appkey:read',
        'AppKey 管理',
        'MENU',
        'KeyOutlined',
        '/app-key',
        58,
        TRUE,
        '查看租户空间下的 AppKey 列表'
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
        ('PLATFORM', 'open-api', 'openapi:read', '查看 OpenAPI', 10),
        ('PLATFORM', 'open-api', 'openapi:create', '创建 OpenAPI', 20),
        ('PLATFORM', 'open-api', 'openapi:update', '编辑 OpenAPI', 30),
        ('PLATFORM', 'open-api', 'openapi:delete', '删除 OpenAPI', 40),
        ('TENANT', 'app-key', 'appkey:read', '查看 AppKey', 10),
        ('TENANT', 'app-key', 'appkey:create', '创建 AppKey', 20),
        ('TENANT', 'app-key', 'appkey:update', '编辑 AppKey', 30),
        ('TENANT', 'app-key', 'appkey:delete', '删除 AppKey', 40)
    ON CONFLICT (workspace_scope, menu_key, permission_code) DO UPDATE
    SET permission_label = EXCLUDED.permission_label,
        permission_sort_order = EXCLUDED.permission_sort_order,
        updated_at = CURRENT_TIMESTAMP;

    SELECT id
    INTO v_platform_tenant_id
    FROM tenants
    WHERE code = 'system-ops'
      AND deleted_at IS NULL
    LIMIT 1;

    IF v_platform_tenant_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission, created_at)
        SELECT r.id, permission_code, now()
        FROM roles r
                 CROSS JOIN (
            VALUES
                ('openapi:*')
        ) AS permissions(permission_code)
        WHERE r.tenant_id = v_platform_tenant_id
          AND r.code = 'system_super_admin'
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
