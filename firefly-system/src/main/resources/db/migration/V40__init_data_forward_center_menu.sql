-- ============================================================
-- 数据流转中心：新增菜单、权限点与预设角色授权
-- 分组「数据流转」下新增两个租户工作区页面：
--   - 数据流转规则（data-forward）
--   - 事件订阅（event-subscription）
-- ============================================================

-- 1. 分组 + 页面菜单目录
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
    ('TENANT', 'tenant-data-forward', NULL, '数据流转', 'SendOutlined', NULL, 'GROUP', 75, TRUE, FALSE),
    ('TENANT', 'data-forward', 'tenant-data-forward', '数据流转规则', 'SendOutlined', '/data-forward', 'PAGE', 10, TRUE, TRUE),
    ('TENANT', 'event-subscription', 'tenant-data-forward', '事件订阅', 'BellOutlined', '/event-subscription', 'PAGE', 20, TRUE, TRUE)
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

-- 2. 菜单权限目录
INSERT INTO workspace_menu_permission_catalog (
    workspace_scope,
    menu_key,
    permission_code,
    permission_label,
    permission_sort_order
) VALUES
    ('TENANT', 'data-forward', 'data-forward:create', '创建数据流转规则', 10),
    ('TENANT', 'data-forward', 'data-forward:read', '查看数据流转规则', 20),
    ('TENANT', 'data-forward', 'data-forward:update', '编辑数据流转规则', 30),
    ('TENANT', 'data-forward', 'data-forward:delete', '删除数据流转规则', 40),
    ('TENANT', 'event-subscription', 'event-subscription:create', '创建事件订阅', 10),
    ('TENANT', 'event-subscription', 'event-subscription:read', '查看事件订阅', 20),
    ('TENANT', 'event-subscription', 'event-subscription:update', '编辑事件订阅', 30),
    ('TENANT', 'event-subscription', 'event-subscription:delete', '删除事件订阅', 40)
ON CONFLICT (workspace_scope, menu_key, permission_code) DO UPDATE
SET permission_label = EXCLUDED.permission_label,
    permission_sort_order = EXCLUDED.permission_sort_order,
    updated_at = CURRENT_TIMESTAMP;

-- 3. 权限资源（MENU + BUTTON）
DO $$
DECLARE
    v_data_forward_read_id BIGINT;
    v_event_subscription_read_id BIGINT;
BEGIN
    INSERT INTO permission_resources (
        parent_id, code, name, type, icon, path, sort_order, enabled, description
    ) VALUES (
        0, 'data-forward:read', '数据流转规则', 'MENU', 'SendOutlined', '/data-forward', 360, TRUE,
        '查看数据流转规则及其运行计数'
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
    RETURNING id INTO v_data_forward_read_id;

    IF v_data_forward_read_id IS NULL THEN
        SELECT id INTO v_data_forward_read_id
        FROM permission_resources
        WHERE code = 'data-forward:read'
        LIMIT 1;
    END IF;

    INSERT INTO permission_resources (
        parent_id, code, name, type, path, sort_order, enabled, description
    ) VALUES
        (v_data_forward_read_id, 'data-forward:create', '创建数据流转规则', 'BUTTON', '/api/v1/data-forward-rules', 1, TRUE, '创建数据流转规则'),
        (v_data_forward_read_id, 'data-forward:update', '编辑数据流转规则', 'BUTTON', '/api/v1/data-forward-rules/{id}', 2, TRUE, '编辑、启用或停用数据流转规则'),
        (v_data_forward_read_id, 'data-forward:delete', '删除数据流转规则', 'BUTTON', '/api/v1/data-forward-rules/{id}', 3, TRUE, '删除数据流转规则')
    ON CONFLICT (code) DO UPDATE
    SET parent_id = EXCLUDED.parent_id,
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        path = EXCLUDED.path,
        sort_order = EXCLUDED.sort_order,
        enabled = EXCLUDED.enabled,
        description = EXCLUDED.description,
        updated_at = NOW();

    INSERT INTO permission_resources (
        parent_id, code, name, type, icon, path, sort_order, enabled, description
    ) VALUES (
        0, 'event-subscription:read', '事件订阅', 'MENU', 'BellOutlined', '/event-subscription', 370, TRUE,
        '查看平台事件 Webhook 订阅及其投递计数'
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
    RETURNING id INTO v_event_subscription_read_id;

    IF v_event_subscription_read_id IS NULL THEN
        SELECT id INTO v_event_subscription_read_id
        FROM permission_resources
        WHERE code = 'event-subscription:read'
        LIMIT 1;
    END IF;

    INSERT INTO permission_resources (
        parent_id, code, name, type, path, sort_order, enabled, description
    ) VALUES
        (v_event_subscription_read_id, 'event-subscription:create', '创建事件订阅', 'BUTTON', '/api/v1/event-subscriptions', 1, TRUE, '创建事件订阅'),
        (v_event_subscription_read_id, 'event-subscription:update', '编辑事件订阅', 'BUTTON', '/api/v1/event-subscriptions/{id}', 2, TRUE, '编辑、启用或停用事件订阅'),
        (v_event_subscription_read_id, 'event-subscription:delete', '删除事件订阅', 'BUTTON', '/api/v1/event-subscriptions/{id}', 3, TRUE, '删除事件订阅')
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

-- 4. 权限分组
INSERT INTO permission_groups (code, name, permissions, sort_order) VALUES
    ('DATA_FORWARD', '数据流转规则', '["data-forward:create","data-forward:read","data-forward:update","data-forward:delete"]', 17),
    ('EVENT_SUBSCRIPTION', '事件订阅', '["event-subscription:create","event-subscription:read","event-subscription:update","event-subscription:delete"]', 18)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    permissions = EXCLUDED.permissions,
    sort_order = EXCLUDED.sort_order;

-- 5. 预设系统角色授权
INSERT INTO role_permissions (role_id, permission, created_at)
SELECT r.id, 'data-forward:*', now()
FROM roles r
WHERE r.type = 'PRESET'
  AND r.is_system = TRUE
ON CONFLICT (role_id, permission) DO NOTHING;

INSERT INTO role_permissions (role_id, permission, created_at)
SELECT r.id, 'event-subscription:*', now()
FROM roles r
WHERE r.type = 'PRESET'
  AND r.is_system = TRUE
ON CONFLICT (role_id, permission) DO NOTHING;
