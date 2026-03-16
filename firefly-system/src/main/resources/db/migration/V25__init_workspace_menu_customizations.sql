-- ============================================================
-- Workspace menu customizations for current tenant workspace.
-- ============================================================

CREATE TABLE IF NOT EXISTS workspace_menu_customizations (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    workspace_scope VARCHAR(16) NOT NULL,
    menu_key        VARCHAR(128) NOT NULL,
    parent_menu_key VARCHAR(128),
    label           VARCHAR(128) NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    updated_by      BIGINT,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_workspace_menu_customizations_tenant_scope_menu
    ON workspace_menu_customizations (tenant_id, workspace_scope, menu_key);

CREATE INDEX IF NOT EXISTS idx_workspace_menu_customizations_tenant_scope
    ON workspace_menu_customizations (tenant_id, workspace_scope);

COMMENT ON TABLE workspace_menu_customizations IS '租户在当前工作空间下的菜单显示个性化配置';
COMMENT ON COLUMN workspace_menu_customizations.workspace_scope IS '所属空间: PLATFORM/TENANT';
COMMENT ON COLUMN workspace_menu_customizations.menu_key IS '菜单业务唯一键';
COMMENT ON COLUMN workspace_menu_customizations.parent_menu_key IS '自定义父级菜单业务唯一键';
COMMENT ON COLUMN workspace_menu_customizations.label IS '自定义菜单显示名称';
COMMENT ON COLUMN workspace_menu_customizations.sort_order IS '自定义排序';

DO $$
DECLARE
    v_permission_parent_id BIGINT;
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
        'menu-customization:read',
        '菜单配置',
        'MENU',
        'MenuOutlined',
        '/menu-customization',
        56,
        TRUE,
        '查看当前工作空间的菜单配置页'
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
    RETURNING id INTO v_permission_parent_id;

    IF v_permission_parent_id IS NULL THEN
        SELECT id
        INTO v_permission_parent_id
        FROM permission_resources
        WHERE code = 'menu-customization:read'
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
        v_permission_parent_id,
        'menu-customization:update',
        '维护菜单配置',
        'BUTTON',
        '/api/v1/workspace-menu-customizations/current',
        1,
        TRUE,
        '调整当前工作空间菜单名称、层级和排序'
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
                ('menu-customization:*')
        ) AS permissions(permission_code)
        WHERE r.tenant_id = v_platform_tenant_id
          AND r.code = 'system_super_admin'
        ON CONFLICT DO NOTHING;
    END IF;
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
    ('PLATFORM', 'menu-customization', 'platform-identity-access', '菜单配置', 'MenuOutlined', '/menu-customization', 'PAGE', 45, TRUE, TRUE),
    ('TENANT', 'menu-customization', 'tenant-identity-access', '菜单配置', 'MenuOutlined', '/menu-customization', 'PAGE', 30, TRUE, TRUE)
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
    ('PLATFORM', 'menu-customization', 'menu-customization:read', '查看菜单配置', 10),
    ('PLATFORM', 'menu-customization', 'menu-customization:update', '维护菜单配置', 20),
    ('TENANT', 'menu-customization', 'menu-customization:read', '查看菜单配置', 10),
    ('TENANT', 'menu-customization', 'menu-customization:update', '维护菜单配置', 20)
ON CONFLICT (workspace_scope, menu_key, permission_code) DO UPDATE
SET permission_label = EXCLUDED.permission_label,
    permission_sort_order = EXCLUDED.permission_sort_order,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO tenant_menu_configs (
    tenant_id,
    menu_key,
    created_by,
    created_at,
    updated_at
)
SELECT
    t.id,
    'menu-customization',
    t.admin_user_id,
    now(),
    now()
FROM tenants t
WHERE t.code <> 'system-ops'
  AND t.deleted_at IS NULL
ON CONFLICT (tenant_id, menu_key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission, created_at)
SELECT
    r.id,
    'menu-customization:*',
    now()
FROM roles r
         INNER JOIN tenants t ON t.id = r.tenant_id
WHERE t.code <> 'system-ops'
  AND t.deleted_at IS NULL
  AND r.code = t.code
ON CONFLICT DO NOTHING;
