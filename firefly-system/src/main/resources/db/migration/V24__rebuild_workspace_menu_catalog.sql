-- ============================================================
-- Rebuild workspace menu catalog and tenant menu authorization
-- around a single authoritative menu tree.
-- ============================================================

DROP TABLE IF EXISTS workspace_menu_catalog CASCADE;

CREATE TABLE workspace_menu_catalog (
    id                   BIGSERIAL PRIMARY KEY,
    workspace_scope      VARCHAR(16)  NOT NULL,
    menu_key             VARCHAR(128) NOT NULL,
    parent_menu_key      VARCHAR(128),
    label                VARCHAR(128) NOT NULL,
    icon                 VARCHAR(128),
    route_path           VARCHAR(128),
    menu_type            VARCHAR(16)  NOT NULL,
    sort_order           INTEGER      NOT NULL DEFAULT 0,
    visible              BOOLEAN      NOT NULL DEFAULT TRUE,
    role_catalog_visible BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uk_workspace_menu_catalog_scope_key
    ON workspace_menu_catalog (workspace_scope, menu_key);

CREATE INDEX idx_workspace_menu_catalog_scope_parent
    ON workspace_menu_catalog (workspace_scope, parent_menu_key, sort_order);

COMMENT ON TABLE workspace_menu_catalog IS '系统运维维护的工作空间基础菜单目录';
COMMENT ON COLUMN workspace_menu_catalog.workspace_scope IS '所属空间: PLATFORM/TENANT';
COMMENT ON COLUMN workspace_menu_catalog.menu_key IS '菜单业务唯一键';
COMMENT ON COLUMN workspace_menu_catalog.parent_menu_key IS '父级菜单业务唯一键';
COMMENT ON COLUMN workspace_menu_catalog.menu_type IS '菜单类型: GROUP/PAGE';
COMMENT ON COLUMN workspace_menu_catalog.role_catalog_visible IS '是否在角色权限目录中展示';

DROP TABLE IF EXISTS workspace_menu_permission_catalog;

CREATE TABLE workspace_menu_permission_catalog (
    id                    BIGSERIAL PRIMARY KEY,
    workspace_scope       VARCHAR(16)  NOT NULL,
    menu_key              VARCHAR(128) NOT NULL,
    permission_code       VARCHAR(128) NOT NULL,
    permission_label      VARCHAR(128) NOT NULL,
    permission_sort_order INTEGER      NOT NULL DEFAULT 0,
    created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uk_workspace_menu_permission_catalog
    ON workspace_menu_permission_catalog (workspace_scope, menu_key, permission_code);

CREATE INDEX idx_workspace_menu_permission_scope_menu
    ON workspace_menu_permission_catalog (workspace_scope, menu_key, permission_sort_order);

COMMENT ON TABLE workspace_menu_permission_catalog IS '基础菜单与权限点绑定表';
COMMENT ON COLUMN workspace_menu_permission_catalog.workspace_scope IS '所属空间: PLATFORM/TENANT';
COMMENT ON COLUMN workspace_menu_permission_catalog.menu_key IS '菜单业务唯一键';
COMMENT ON COLUMN workspace_menu_permission_catalog.permission_code IS '权限编码';

DROP TABLE IF EXISTS tenant_menu_configs;

CREATE TABLE tenant_menu_configs (
    id         BIGSERIAL PRIMARY KEY,
    tenant_id  BIGINT NOT NULL,
    menu_key   VARCHAR(128) NOT NULL,
    created_by BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uk_tenant_menu_configs_tenant_menu
    ON tenant_menu_configs (tenant_id, menu_key);

CREATE INDEX idx_tenant_menu_configs_tenant
    ON tenant_menu_configs (tenant_id);

COMMENT ON TABLE tenant_menu_configs IS '租户空间已授权菜单键集合';
COMMENT ON COLUMN tenant_menu_configs.menu_key IS '租户已启用的菜单业务唯一键';

DO $$
DECLARE
    v_workspace_menu_read_id BIGINT;
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
        'workspace-menu:read',
        '系统菜单权限',
        'MENU',
        'AppstoreOutlined',
        '/system-menu-permission',
        55,
        TRUE,
        '查看平台空间和租户业务空间的基础菜单目录'
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
    RETURNING id INTO v_workspace_menu_read_id;

    IF v_workspace_menu_read_id IS NULL THEN
        SELECT id
        INTO v_workspace_menu_read_id
        FROM permission_resources
        WHERE code = 'workspace-menu:read';
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
        v_workspace_menu_read_id,
        'workspace-menu:update',
        '维护系统菜单权限',
        'BUTTON',
        '/api/v1/system-menu-permissions',
        1,
        TRUE,
        '新增、编辑、删除基础菜单并维护菜单权限集合'
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
    SELECT r.id, permission_code, now()
    FROM roles r
             INNER JOIN tenants t ON t.id = r.tenant_id
             CROSS JOIN (
        VALUES
            ('workspace-menu:read'),
            ('workspace-menu:update')
    ) AS seed(permission_code)
    WHERE t.code = 'system-ops'
      AND r.code = 'system_super_admin'
    ON CONFLICT DO NOTHING;
END $$;

WITH menu_seed(workspace_scope, menu_key, parent_menu_key, label, icon, route_path, menu_type, sort_order, visible, role_catalog_visible) AS (
    VALUES
        ('PLATFORM', 'dashboard', NULL, '工作台', 'DashboardOutlined', '/dashboard', 'PAGE', 10, TRUE, TRUE),
        ('PLATFORM', 'platform-tenant-space', NULL, '租户与空间', 'BankOutlined', NULL, 'GROUP', 20, TRUE, FALSE),
        ('PLATFORM', 'tenant', 'platform-tenant-space', '租户管理', 'BankOutlined', '/tenant', 'PAGE', 10, TRUE, TRUE),
        ('PLATFORM', 'platform-identity-access', NULL, '用户与权限', 'SafetyOutlined', NULL, 'GROUP', 30, TRUE, FALSE),
        ('PLATFORM', 'user', 'platform-identity-access', '用户管理', 'TeamOutlined', '/user', 'PAGE', 10, TRUE, TRUE),
        ('PLATFORM', 'role', 'platform-identity-access', '角色管理', 'SafetyOutlined', '/role', 'PAGE', 20, TRUE, TRUE),
        ('PLATFORM', 'permission', 'platform-identity-access', '权限资源', 'KeyOutlined', '/permission', 'PAGE', 30, TRUE, TRUE),
        ('PLATFORM', 'system-menu-permission', 'platform-identity-access', '系统菜单权限', 'AppstoreOutlined', '/system-menu-permission', 'PAGE', 40, TRUE, TRUE),
        ('PLATFORM', 'dict', 'platform-identity-access', '数据字典', 'BookOutlined', '/dict', 'PAGE', 50, TRUE, TRUE),
        ('PLATFORM', 'platform-system-ops', NULL, '系统运维', 'SettingOutlined', NULL, 'GROUP', 40, TRUE, FALSE),
        ('PLATFORM', 'settings', 'platform-system-ops', '系统设置', 'SettingOutlined', '/settings', 'PAGE', 10, TRUE, TRUE),
        ('PLATFORM', 'notification', 'platform-system-ops', '通知渠道', 'BellOutlined', '/notification', 'PAGE', 20, TRUE, TRUE),
        ('PLATFORM', 'scheduled-task', 'platform-system-ops', '定时任务', 'ScheduleOutlined', '/scheduled-task', 'PAGE', 30, TRUE, TRUE),
        ('PLATFORM', 'monitor', 'platform-system-ops', '系统监控', 'MonitorOutlined', '/monitor', 'PAGE', 40, TRUE, TRUE),
        ('PLATFORM', 'platform-security-audit', NULL, '安全审计', 'SecurityScanOutlined', NULL, 'GROUP', 50, TRUE, FALSE),
        ('PLATFORM', 'security', 'platform-security-audit', '安全管理', 'LockOutlined', '/security', 'PAGE', 10, TRUE, FALSE),
        ('PLATFORM', 'api-key', 'platform-security-audit', 'API Key', 'ApiOutlined', '/api-key', 'PAGE', 20, TRUE, TRUE),
        ('PLATFORM', 'audit-log', 'platform-security-audit', '审计日志', 'FileSearchOutlined', '/audit-log', 'PAGE', 30, TRUE, TRUE),
        ('PLATFORM', 'operation-log', 'platform-security-audit', '操作日志', 'FileTextOutlined', '/operation-log', 'PAGE', 40, TRUE, TRUE),

        ('TENANT', 'dashboard', NULL, '工作台', 'DashboardOutlined', '/dashboard', 'PAGE', 10, TRUE, TRUE),
        ('TENANT', 'tenant-identity-access', NULL, '组织与权限', 'TeamOutlined', NULL, 'GROUP', 20, TRUE, FALSE),
        ('TENANT', 'user', 'tenant-identity-access', '用户管理', 'TeamOutlined', '/user', 'PAGE', 10, TRUE, TRUE),
        ('TENANT', 'role', 'tenant-identity-access', '角色管理', 'SafetyOutlined', '/role', 'PAGE', 20, TRUE, TRUE),
        ('TENANT', 'tenant-project-collaboration', NULL, '项目协同', 'ProjectOutlined', NULL, 'GROUP', 30, TRUE, FALSE),
        ('TENANT', 'project', 'tenant-project-collaboration', '项目管理', 'ProjectOutlined', '/project', 'PAGE', 10, TRUE, TRUE),
        ('TENANT', 'share', 'tenant-project-collaboration', '跨租户共享', 'ShareAltOutlined', '/share', 'PAGE', 20, TRUE, TRUE),
        ('TENANT', 'tenant-device-access', NULL, '设备接入', 'ApiOutlined', NULL, 'GROUP', 40, TRUE, FALSE),
        ('TENANT', 'product', 'tenant-device-access', '产品与物模型', 'AppstoreOutlined', '/product', 'PAGE', 10, TRUE, TRUE),
        ('TENANT', 'protocol-parser', 'tenant-device-access', '协议解析', 'ApiOutlined', '/protocol-parser', 'PAGE', 20, TRUE, TRUE),
        ('TENANT', 'tenant-device-protocol-access', 'tenant-device-access', '协议接入', 'ApiOutlined', NULL, 'GROUP', 30, TRUE, FALSE),
        ('TENANT', 'snmp', 'tenant-device-protocol-access', 'SNMP 接入', 'ApiOutlined', '/snmp', 'PAGE', 10, TRUE, FALSE),
        ('TENANT', 'modbus', 'tenant-device-protocol-access', 'Modbus 接入', 'ApiOutlined', '/modbus', 'PAGE', 20, TRUE, FALSE),
        ('TENANT', 'websocket', 'tenant-device-protocol-access', 'WebSocket 接入', 'ApiOutlined', '/websocket', 'PAGE', 30, TRUE, FALSE),
        ('TENANT', 'tcp-udp', 'tenant-device-protocol-access', 'TCP/UDP 接入', 'ApiOutlined', '/tcp-udp', 'PAGE', 40, TRUE, FALSE),
        ('TENANT', 'lorawan', 'tenant-device-protocol-access', 'LoRaWAN 接入', 'ApiOutlined', '/lorawan', 'PAGE', 50, TRUE, FALSE),
        ('TENANT', 'tenant-device-assets', NULL, '设备资产', 'HddOutlined', NULL, 'GROUP', 50, TRUE, FALSE),
        ('TENANT', 'device', 'tenant-device-assets', '设备管理', 'HddOutlined', '/device', 'PAGE', 10, TRUE, TRUE),
        ('TENANT', 'device-group', 'tenant-device-assets', '设备分组', 'GroupOutlined', '/device-group', 'PAGE', 20, TRUE, TRUE),
        ('TENANT', 'device-tag', 'tenant-device-assets', '设备标签', 'TagOutlined', '/device-tag', 'PAGE', 30, TRUE, TRUE),
        ('TENANT', 'geo-fence', 'tenant-device-assets', '地理围栏', 'AimOutlined', '/geo-fence', 'PAGE', 40, TRUE, TRUE),
        ('TENANT', 'device-shadow', 'tenant-device-assets', '设备影子', 'CloudSyncOutlined', '/device-shadow', 'PAGE', 50, TRUE, TRUE),
        ('TENANT', 'device-message', 'tenant-device-assets', '设备消息', 'SendOutlined', '/device-message', 'PAGE', 60, TRUE, TRUE),
        ('TENANT', 'tenant-rule-alarm', NULL, '规则与告警', 'ControlOutlined', NULL, 'GROUP', 60, TRUE, FALSE),
        ('TENANT', 'rule-engine', 'tenant-rule-alarm', '规则引擎', 'ThunderboltOutlined', '/rule-engine', 'PAGE', 10, TRUE, TRUE),
        ('TENANT', 'alarm-rules', 'tenant-rule-alarm', '告警规则', 'AlertOutlined', '/alarm-rules', 'PAGE', 20, TRUE, TRUE),
        ('TENANT', 'alarm-recipient-groups', 'tenant-rule-alarm', '告警接收组', 'TeamOutlined', '/alarm-recipient-groups', 'PAGE', 30, TRUE, TRUE),
        ('TENANT', 'alarm-records', 'tenant-rule-alarm', '告警处理', 'ToolOutlined', '/alarm-records', 'PAGE', 40, TRUE, TRUE),
        ('TENANT', 'notification-records', 'tenant-rule-alarm', '通知记录', 'BellOutlined', '/notification-records', 'PAGE', 50, TRUE, TRUE),
        ('TENANT', 'message-template', 'tenant-rule-alarm', '消息模板', 'MessageOutlined', '/message-template', 'PAGE', 60, TRUE, TRUE),
        ('TENANT', 'tenant-data-insight', NULL, '数据与任务', 'DatabaseOutlined', NULL, 'GROUP', 70, TRUE, FALSE),
        ('TENANT', 'device-data', 'tenant-data-insight', '设备数据', 'LineChartOutlined', '/device-data', 'PAGE', 10, TRUE, TRUE),
        ('TENANT', 'analysis', 'tenant-data-insight', '数据分析', 'FundOutlined', '/analysis', 'PAGE', 20, TRUE, TRUE),
        ('TENANT', 'device-log', 'tenant-data-insight', '设备日志', 'FileTextOutlined', '/device-log', 'PAGE', 30, TRUE, TRUE),
        ('TENANT', 'export', 'tenant-data-insight', '异步任务', 'ExportOutlined', '/export', 'PAGE', 40, TRUE, TRUE),
        ('TENANT', 'tenant-ops-tools', NULL, '运维工具', 'ToolOutlined', NULL, 'GROUP', 80, TRUE, FALSE),
        ('TENANT', 'firmware', 'tenant-ops-tools', '固件管理', 'UsbOutlined', '/firmware', 'PAGE', 10, TRUE, TRUE),
        ('TENANT', 'ota', 'tenant-ops-tools', 'OTA 升级', 'CloudUploadOutlined', '/ota', 'PAGE', 20, TRUE, TRUE),
        ('TENANT', 'video', 'tenant-ops-tools', '视频监控', 'VideoCameraOutlined', '/video', 'PAGE', 30, TRUE, TRUE)
)
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
)
SELECT * FROM menu_seed;

WITH permission_seed(workspace_scope, menu_key, permission_code, permission_label, permission_sort_order) AS (
    VALUES
        ('PLATFORM', 'dashboard', 'dashboard:read', '查看工作台', 10),
        ('TENANT', 'dashboard', 'dashboard:read', '查看工作台', 10),
        ('PLATFORM', 'tenant', 'tenant:read', '查看租户', 10),
        ('PLATFORM', 'tenant', 'tenant:manage', '维护租户', 20),
        ('PLATFORM', 'user', 'user:create', '创建用户', 10),
        ('PLATFORM', 'user', 'user:read', '查看用户', 20),
        ('PLATFORM', 'user', 'user:update', '编辑用户', 30),
        ('PLATFORM', 'user', 'user:delete', '删除用户', 40),
        ('PLATFORM', 'user', 'user:role:assign', '分配用户角色', 50),
        ('TENANT', 'user', 'user:create', '创建用户', 10),
        ('TENANT', 'user', 'user:read', '查看用户', 20),
        ('TENANT', 'user', 'user:update', '编辑用户', 30),
        ('TENANT', 'user', 'user:delete', '删除用户', 40),
        ('TENANT', 'user', 'user:role:assign', '分配用户角色', 50),
        ('PLATFORM', 'role', 'role:create', '创建角色', 10),
        ('PLATFORM', 'role', 'role:read', '查看角色', 20),
        ('PLATFORM', 'role', 'role:update', '编辑角色', 30),
        ('PLATFORM', 'role', 'role:delete', '删除角色', 40),
        ('TENANT', 'role', 'role:create', '创建角色', 10),
        ('TENANT', 'role', 'role:read', '查看角色', 20),
        ('TENANT', 'role', 'role:update', '编辑角色', 30),
        ('TENANT', 'role', 'role:delete', '删除角色', 40),
        ('PLATFORM', 'permission', 'permission:create', '创建权限资源', 10),
        ('PLATFORM', 'permission', 'permission:read', '查看权限资源', 20),
        ('PLATFORM', 'permission', 'permission:update', '编辑权限资源', 30),
        ('PLATFORM', 'permission', 'permission:delete', '删除权限资源', 40),
        ('PLATFORM', 'system-menu-permission', 'workspace-menu:read', '查看系统菜单权限', 10),
        ('PLATFORM', 'system-menu-permission', 'workspace-menu:update', '维护系统菜单权限', 20),
        ('PLATFORM', 'dict', 'dict:create', '创建字典', 10),
        ('PLATFORM', 'dict', 'dict:read', '查看字典', 20),
        ('PLATFORM', 'dict', 'dict:update', '编辑字典', 30),
        ('PLATFORM', 'dict', 'dict:delete', '删除字典', 40),
        ('PLATFORM', 'settings', 'system:read', '查看系统设置', 10),
        ('PLATFORM', 'settings', 'system:update', '维护系统设置', 20),
        ('PLATFORM', 'notification', 'notification:read', '查看通知渠道', 10),
        ('PLATFORM', 'notification', 'notification:update', '维护通知渠道', 20),
        ('PLATFORM', 'notification', 'notification:delete', '删除通知渠道', 30),
        ('PLATFORM', 'scheduled-task', 'system:read', '查看定时任务', 10),
        ('PLATFORM', 'scheduled-task', 'system:update', '维护定时任务', 20),
        ('PLATFORM', 'monitor', 'monitor:read', '查看系统监控', 10),
        ('PLATFORM', 'security', 'user:read', '查看安全管理', 10),
        ('PLATFORM', 'api-key', 'apikey:create', '创建 API Key', 10),
        ('PLATFORM', 'api-key', 'apikey:read', '查看 API Key', 20),
        ('PLATFORM', 'api-key', 'apikey:update', '编辑 API Key', 30),
        ('PLATFORM', 'api-key', 'apikey:delete', '删除 API Key', 40),
        ('PLATFORM', 'audit-log', 'audit:read', '查看审计日志', 10),
        ('PLATFORM', 'operation-log', 'operation-log:read', '查看操作日志', 10),
        ('PLATFORM', 'operation-log', 'operation-log:delete', '清理操作日志', 20),
        ('TENANT', 'project', 'project:create', '创建项目', 10),
        ('TENANT', 'project', 'project:read', '查看项目', 20),
        ('TENANT', 'project', 'project:update', '编辑项目', 30),
        ('TENANT', 'project', 'project:delete', '删除项目', 40),
        ('TENANT', 'share', 'share:create', '创建共享策略', 10),
        ('TENANT', 'share', 'share:read', '查看共享策略', 20),
        ('TENANT', 'share', 'share:update', '编辑共享策略', 30),
        ('TENANT', 'share', 'share:delete', '删除共享策略', 40),
        ('TENANT', 'share', 'share:approve', '审批共享策略', 50),
        ('TENANT', 'product', 'product:create', '创建产品', 10),
        ('TENANT', 'product', 'product:read', '查看产品', 20),
        ('TENANT', 'product', 'product:update', '编辑产品', 30),
        ('TENANT', 'product', 'product:delete', '删除产品', 40),
        ('TENANT', 'product', 'product:publish', '发布产品', 50),
        ('TENANT', 'protocol-parser', 'protocol-parser:create', '创建协议解析', 10),
        ('TENANT', 'protocol-parser', 'protocol-parser:read', '查看协议解析', 20),
        ('TENANT', 'protocol-parser', 'protocol-parser:update', '编辑协议解析', 30),
        ('TENANT', 'protocol-parser', 'protocol-parser:test', '调试协议解析', 40),
        ('TENANT', 'protocol-parser', 'protocol-parser:publish', '发布协议解析', 50),
        ('TENANT', 'snmp', 'device:read', '查看 SNMP 接入', 10),
        ('TENANT', 'modbus', 'device:read', '查看 Modbus 接入', 10),
        ('TENANT', 'websocket', 'device:read', '查看 WebSocket 接入', 10),
        ('TENANT', 'tcp-udp', 'device:read', '查看 TCP/UDP 接入', 10),
        ('TENANT', 'lorawan', 'device:read', '查看 LoRaWAN 接入', 10),
        ('TENANT', 'device', 'device:create', '创建设备', 10),
        ('TENANT', 'device', 'device:read', '查看设备', 20),
        ('TENANT', 'device', 'device:update', '编辑设备', 30),
        ('TENANT', 'device', 'device:delete', '删除设备', 40),
        ('TENANT', 'device', 'device:control', '控制设备', 50),
        ('TENANT', 'device', 'device:debug', '调试设备', 60),
        ('TENANT', 'device', 'device:import', '导入设备', 70),
        ('TENANT', 'device', 'device:export', '导出设备', 80),
        ('TENANT', 'device-group', 'device-group:create', '创建设备分组', 10),
        ('TENANT', 'device-group', 'device-group:read', '查看设备分组', 20),
        ('TENANT', 'device-group', 'device-group:update', '编辑设备分组', 30),
        ('TENANT', 'device-group', 'device-group:delete', '删除设备分组', 40),
        ('TENANT', 'device-tag', 'device-tag:create', '创建设备标签', 10),
        ('TENANT', 'device-tag', 'device-tag:read', '查看设备标签', 20),
        ('TENANT', 'device-tag', 'device-tag:update', '编辑设备标签', 30),
        ('TENANT', 'device-tag', 'device-tag:delete', '删除设备标签', 40),
        ('TENANT', 'geo-fence', 'geo-fence:create', '创建地理围栏', 10),
        ('TENANT', 'geo-fence', 'geo-fence:read', '查看地理围栏', 20),
        ('TENANT', 'geo-fence', 'geo-fence:update', '编辑地理围栏', 30),
        ('TENANT', 'geo-fence', 'geo-fence:delete', '删除地理围栏', 40),
        ('TENANT', 'device-shadow', 'device:read', '查看设备影子', 10),
        ('TENANT', 'device-shadow', 'device:update', '维护设备影子', 20),
        ('TENANT', 'device-shadow', 'device:delete', '删除设备影子', 30),
        ('TENANT', 'device-message', 'device:read', '查看设备消息', 10),
        ('TENANT', 'device-message', 'device:control', '下发设备消息', 20),
        ('TENANT', 'rule-engine', 'rule:create', '创建规则', 10),
        ('TENANT', 'rule-engine', 'rule:read', '查看规则', 20),
        ('TENANT', 'rule-engine', 'rule:update', '编辑规则', 30),
        ('TENANT', 'rule-engine', 'rule:delete', '删除规则', 40),
        ('TENANT', 'rule-engine', 'rule:enable', '启停规则', 50),
        ('TENANT', 'alarm-rules', 'alarm:create', '创建告警规则', 10),
        ('TENANT', 'alarm-rules', 'alarm:read', '查看告警规则', 20),
        ('TENANT', 'alarm-rules', 'alarm:update', '编辑告警规则', 30),
        ('TENANT', 'alarm-rules', 'alarm:delete', '删除告警规则', 40),
        ('TENANT', 'alarm-recipient-groups', 'alarm:read', '查看告警接收组', 10),
        ('TENANT', 'alarm-recipient-groups', 'alarm:update', '维护告警接收组', 20),
        ('TENANT', 'alarm-records', 'alarm:read', '查看告警记录', 10),
        ('TENANT', 'alarm-records', 'alarm:confirm', '确认告警', 20),
        ('TENANT', 'alarm-records', 'alarm:process', '处理告警', 30),
        ('TENANT', 'notification-records', 'notification:read', '查看通知记录', 10),
        ('TENANT', 'message-template', 'message-template:create', '创建消息模板', 10),
        ('TENANT', 'message-template', 'message-template:read', '查看消息模板', 20),
        ('TENANT', 'message-template', 'message-template:update', '编辑消息模板', 30),
        ('TENANT', 'message-template', 'message-template:delete', '删除消息模板', 40),
        ('TENANT', 'device-data', 'data:read', '查看设备数据', 10),
        ('TENANT', 'analysis', 'analysis:read', '查看数据分析', 10),
        ('TENANT', 'analysis', 'analysis:export', '导出分析结果', 20),
        ('TENANT', 'device-log', 'device-log:read', '查看设备日志', 10),
        ('TENANT', 'device-log', 'device-log:delete', '清理设备日志', 20),
        ('TENANT', 'export', 'export:create', '创建异步任务', 10),
        ('TENANT', 'export', 'export:read', '查看异步任务', 20),
        ('TENANT', 'export', 'export:update', '取消异步任务', 30),
        ('TENANT', 'export', 'export:delete', '清理异步任务', 40),
        ('TENANT', 'firmware', 'firmware:read', '查看固件管理', 10),
        ('TENANT', 'firmware', 'firmware:update', '维护固件管理', 20),
        ('TENANT', 'ota', 'ota:read', '查看 OTA 升级', 10),
        ('TENANT', 'ota', 'ota:upload', '上传固件', 20),
        ('TENANT', 'ota', 'ota:deploy', '下发升级', 30),
        ('TENANT', 'ota', 'ota:delete', '删除 OTA 任务', 40),
        ('TENANT', 'video', 'video:create', '创建视频设备', 10),
        ('TENANT', 'video', 'video:read', '查看视频设备', 20),
        ('TENANT', 'video', 'video:update', '编辑视频设备', 30),
        ('TENANT', 'video', 'video:delete', '删除视频设备', 40),
        ('TENANT', 'video', 'video:stream', '视频流控制', 50),
        ('TENANT', 'video', 'video:ptz', '云台控制', 60),
        ('TENANT', 'video', 'video:record', '录像控制', 70)
)
INSERT INTO workspace_menu_permission_catalog (
    workspace_scope,
    menu_key,
    permission_code,
    permission_label,
    permission_sort_order
)
SELECT * FROM permission_seed;
