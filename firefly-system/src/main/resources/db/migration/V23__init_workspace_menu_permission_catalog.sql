CREATE TABLE IF NOT EXISTS workspace_menu_permission_catalog (
    id                   BIGSERIAL PRIMARY KEY,
    workspace_scope      VARCHAR(16)  NOT NULL,
    module_key           VARCHAR(64)  NOT NULL,
    module_label         VARCHAR(128) NOT NULL,
    menu_path            VARCHAR(128) NOT NULL,
    permission_code      VARCHAR(128) NOT NULL,
    permission_label     VARCHAR(128) NOT NULL,
    module_sort_order    INTEGER      NOT NULL DEFAULT 0,
    permission_sort_order INTEGER     NOT NULL DEFAULT 0,
    role_catalog_visible BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_workspace_menu_permission_catalog
    ON workspace_menu_permission_catalog (workspace_scope, module_key, permission_code);

CREATE INDEX IF NOT EXISTS idx_workspace_menu_permission_scope_path
    ON workspace_menu_permission_catalog (workspace_scope, menu_path);

COMMENT ON TABLE workspace_menu_permission_catalog IS '工作空间菜单与权限点映射台账';
COMMENT ON COLUMN workspace_menu_permission_catalog.workspace_scope IS '所属空间: PLATFORM/TENANT';
COMMENT ON COLUMN workspace_menu_permission_catalog.module_key IS '功能模块唯一标识';
COMMENT ON COLUMN workspace_menu_permission_catalog.module_label IS '功能模块名称';
COMMENT ON COLUMN workspace_menu_permission_catalog.menu_path IS '前端菜单路由';
COMMENT ON COLUMN workspace_menu_permission_catalog.permission_code IS '权限点编码';
COMMENT ON COLUMN workspace_menu_permission_catalog.permission_label IS '权限点名称';
COMMENT ON COLUMN workspace_menu_permission_catalog.module_sort_order IS '模块排序';
COMMENT ON COLUMN workspace_menu_permission_catalog.permission_sort_order IS '权限排序';
COMMENT ON COLUMN workspace_menu_permission_catalog.role_catalog_visible IS '是否在角色授权目录展示';

WITH seed(workspace_scope, module_key, module_label, menu_path, permission_code, permission_label, module_sort_order, permission_sort_order, role_catalog_visible) AS (
    VALUES
        ('PLATFORM', 'dashboard', '工作台', '/dashboard', 'dashboard:read', '查看工作台', 10, 10, TRUE),
        ('TENANT', 'dashboard', '工作台', '/dashboard', 'dashboard:read', '查看工作台', 10, 10, TRUE),

        ('PLATFORM', 'tenant', '租户管理', '/tenant', 'tenant:read', '查看租户', 20, 10, TRUE),
        ('PLATFORM', 'tenant', '租户管理', '/tenant', 'tenant:manage', '维护租户', 20, 20, TRUE),

        ('PLATFORM', 'user', '用户管理', '/user', 'user:create', '创建用户', 30, 10, TRUE),
        ('PLATFORM', 'user', '用户管理', '/user', 'user:read', '查看用户', 30, 20, TRUE),
        ('PLATFORM', 'user', '用户管理', '/user', 'user:update', '编辑用户', 30, 30, TRUE),
        ('PLATFORM', 'user', '用户管理', '/user', 'user:delete', '删除用户', 30, 40, TRUE),
        ('PLATFORM', 'user', '用户管理', '/user', 'user:role:assign', '分配用户角色', 30, 50, TRUE),
        ('TENANT', 'user', '用户管理', '/user', 'user:create', '创建用户', 30, 10, TRUE),
        ('TENANT', 'user', '用户管理', '/user', 'user:read', '查看用户', 30, 20, TRUE),
        ('TENANT', 'user', '用户管理', '/user', 'user:update', '编辑用户', 30, 30, TRUE),
        ('TENANT', 'user', '用户管理', '/user', 'user:delete', '删除用户', 30, 40, TRUE),
        ('TENANT', 'user', '用户管理', '/user', 'user:role:assign', '分配用户角色', 30, 50, TRUE),

        ('PLATFORM', 'role', '角色管理', '/role', 'role:create', '创建角色', 40, 10, TRUE),
        ('PLATFORM', 'role', '角色管理', '/role', 'role:read', '查看角色', 40, 20, TRUE),
        ('PLATFORM', 'role', '角色管理', '/role', 'role:update', '编辑角色', 40, 30, TRUE),
        ('PLATFORM', 'role', '角色管理', '/role', 'role:delete', '删除角色', 40, 40, TRUE),
        ('TENANT', 'role', '角色管理', '/role', 'role:create', '创建角色', 40, 10, TRUE),
        ('TENANT', 'role', '角色管理', '/role', 'role:read', '查看角色', 40, 20, TRUE),
        ('TENANT', 'role', '角色管理', '/role', 'role:update', '编辑角色', 40, 30, TRUE),
        ('TENANT', 'role', '角色管理', '/role', 'role:delete', '删除角色', 40, 40, TRUE),

        ('PLATFORM', 'permission', '权限资源', '/permission', 'permission:create', '创建权限资源', 50, 10, TRUE),
        ('PLATFORM', 'permission', '权限资源', '/permission', 'permission:read', '查看权限资源', 50, 20, TRUE),
        ('PLATFORM', 'permission', '权限资源', '/permission', 'permission:update', '编辑权限资源', 50, 30, TRUE),
        ('PLATFORM', 'permission', '权限资源', '/permission', 'permission:delete', '删除权限资源', 50, 40, TRUE),

        ('PLATFORM', 'dict', '数据字典', '/dict', 'dict:create', '创建字典', 60, 10, TRUE),
        ('PLATFORM', 'dict', '数据字典', '/dict', 'dict:read', '查看字典', 60, 20, TRUE),
        ('PLATFORM', 'dict', '数据字典', '/dict', 'dict:update', '编辑字典', 60, 30, TRUE),
        ('PLATFORM', 'dict', '数据字典', '/dict', 'dict:delete', '删除字典', 60, 40, TRUE),

        ('PLATFORM', 'settings', '系统设置', '/settings', 'system:read', '查看系统设置', 70, 10, TRUE),
        ('PLATFORM', 'settings', '系统设置', '/settings', 'system:update', '维护系统设置', 70, 20, TRUE),

        ('PLATFORM', 'notification-channel', '通知渠道', '/notification', 'notification:read', '查看通知渠道', 80, 10, TRUE),
        ('PLATFORM', 'notification-channel', '通知渠道', '/notification', 'notification:update', '维护通知渠道', 80, 20, TRUE),
        ('PLATFORM', 'notification-channel', '通知渠道', '/notification', 'notification:delete', '删除通知渠道', 80, 30, TRUE),

        ('PLATFORM', 'scheduled-task', '定时任务', '/scheduled-task', 'system:read', '查看定时任务', 90, 10, TRUE),
        ('PLATFORM', 'scheduled-task', '定时任务', '/scheduled-task', 'system:update', '维护定时任务', 90, 20, TRUE),

        ('PLATFORM', 'monitor', '系统监控', '/monitor', 'monitor:read', '查看系统监控', 100, 10, TRUE),

        ('PLATFORM', 'security', '安全管理', '/security', 'user:read', '查看安全管理页', 110, 10, FALSE),

        ('PLATFORM', 'api-key', 'API Key', '/api-key', 'apikey:create', '创建 API Key', 120, 10, TRUE),
        ('PLATFORM', 'api-key', 'API Key', '/api-key', 'apikey:read', '查看 API Key', 120, 20, TRUE),
        ('PLATFORM', 'api-key', 'API Key', '/api-key', 'apikey:update', '编辑 API Key', 120, 30, TRUE),
        ('PLATFORM', 'api-key', 'API Key', '/api-key', 'apikey:delete', '删除 API Key', 120, 40, TRUE),

        ('PLATFORM', 'audit-log', '审计日志', '/audit-log', 'audit:read', '查看审计日志', 130, 10, TRUE),

        ('PLATFORM', 'operation-log', '操作日志', '/operation-log', 'operation-log:read', '查看操作日志', 140, 10, TRUE),
        ('PLATFORM', 'operation-log', '操作日志', '/operation-log', 'operation-log:delete', '清理操作日志', 140, 20, TRUE),

        ('TENANT', 'project', '项目管理', '/project', 'project:create', '创建项目', 200, 10, TRUE),
        ('TENANT', 'project', '项目管理', '/project', 'project:read', '查看项目', 200, 20, TRUE),
        ('TENANT', 'project', '项目管理', '/project', 'project:update', '编辑项目', 200, 30, TRUE),
        ('TENANT', 'project', '项目管理', '/project', 'project:delete', '删除项目', 200, 40, TRUE),

        ('TENANT', 'share', '跨租户共享', '/share', 'share:create', '创建共享策略', 210, 10, TRUE),
        ('TENANT', 'share', '跨租户共享', '/share', 'share:read', '查看共享策略', 210, 20, TRUE),
        ('TENANT', 'share', '跨租户共享', '/share', 'share:update', '编辑共享策略', 210, 30, TRUE),
        ('TENANT', 'share', '跨租户共享', '/share', 'share:delete', '删除共享策略', 210, 40, TRUE),
        ('TENANT', 'share', '跨租户共享', '/share', 'share:approve', '审批共享策略', 210, 50, TRUE),

        ('TENANT', 'product', '产品与物模型', '/product', 'product:create', '创建产品', 220, 10, TRUE),
        ('TENANT', 'product', '产品与物模型', '/product', 'product:read', '查看产品', 220, 20, TRUE),
        ('TENANT', 'product', '产品与物模型', '/product', 'product:update', '编辑产品', 220, 30, TRUE),
        ('TENANT', 'product', '产品与物模型', '/product', 'product:delete', '删除产品', 220, 40, TRUE),
        ('TENANT', 'product', '产品与物模型', '/product', 'product:publish', '发布产品', 220, 50, TRUE),

        ('TENANT', 'protocol-parser', '协议解析', '/protocol-parser', 'protocol-parser:create', '创建协议解析', 230, 10, TRUE),
        ('TENANT', 'protocol-parser', '协议解析', '/protocol-parser', 'protocol-parser:read', '查看协议解析', 230, 20, TRUE),
        ('TENANT', 'protocol-parser', '协议解析', '/protocol-parser', 'protocol-parser:update', '编辑协议解析', 230, 30, TRUE),
        ('TENANT', 'protocol-parser', '协议解析', '/protocol-parser', 'protocol-parser:test', '调试协议解析', 230, 40, TRUE),
        ('TENANT', 'protocol-parser', '协议解析', '/protocol-parser', 'protocol-parser:publish', '发布协议解析', 230, 50, TRUE),

        ('TENANT', 'device', '设备管理', '/device', 'device:create', '创建设备', 240, 10, TRUE),
        ('TENANT', 'device', '设备管理', '/device', 'device:read', '查看设备', 240, 20, TRUE),
        ('TENANT', 'device', '设备管理', '/device', 'device:update', '编辑设备', 240, 30, TRUE),
        ('TENANT', 'device', '设备管理', '/device', 'device:delete', '删除设备', 240, 40, TRUE),
        ('TENANT', 'device', '设备管理', '/device', 'device:control', '控制设备', 240, 50, TRUE),
        ('TENANT', 'device', '设备管理', '/device', 'device:debug', '调试设备', 240, 60, TRUE),
        ('TENANT', 'device', '设备管理', '/device', 'device:import', '导入设备', 240, 70, TRUE),
        ('TENANT', 'device', '设备管理', '/device', 'device:export', '导出设备', 240, 80, TRUE),

        ('TENANT', 'device-group', '设备分组', '/device-group', 'device-group:create', '创建设备分组', 250, 10, TRUE),
        ('TENANT', 'device-group', '设备分组', '/device-group', 'device-group:read', '查看设备分组', 250, 20, TRUE),
        ('TENANT', 'device-group', '设备分组', '/device-group', 'device-group:update', '编辑设备分组', 250, 30, TRUE),
        ('TENANT', 'device-group', '设备分组', '/device-group', 'device-group:delete', '删除设备分组', 250, 40, TRUE),

        ('TENANT', 'device-tag', '设备标签', '/device-tag', 'device-tag:create', '创建设备标签', 260, 10, TRUE),
        ('TENANT', 'device-tag', '设备标签', '/device-tag', 'device-tag:read', '查看设备标签', 260, 20, TRUE),
        ('TENANT', 'device-tag', '设备标签', '/device-tag', 'device-tag:update', '编辑设备标签', 260, 30, TRUE),
        ('TENANT', 'device-tag', '设备标签', '/device-tag', 'device-tag:delete', '删除设备标签', 260, 40, TRUE),

        ('TENANT', 'geo-fence', '地理围栏', '/geo-fence', 'geo-fence:create', '创建地理围栏', 270, 10, TRUE),
        ('TENANT', 'geo-fence', '地理围栏', '/geo-fence', 'geo-fence:read', '查看地理围栏', 270, 20, TRUE),
        ('TENANT', 'geo-fence', '地理围栏', '/geo-fence', 'geo-fence:update', '编辑地理围栏', 270, 30, TRUE),
        ('TENANT', 'geo-fence', '地理围栏', '/geo-fence', 'geo-fence:delete', '删除地理围栏', 270, 40, TRUE),

        ('TENANT', 'device-shadow', '设备影子', '/device-shadow', 'device:read', '查看设备影子', 280, 10, TRUE),
        ('TENANT', 'device-shadow', '设备影子', '/device-shadow', 'device:update', '编辑设备影子', 280, 20, TRUE),
        ('TENANT', 'device-shadow', '设备影子', '/device-shadow', 'device:delete', '删除设备影子', 280, 30, TRUE),

        ('TENANT', 'device-message', '设备消息', '/device-message', 'device:read', '查看设备消息', 290, 10, TRUE),
        ('TENANT', 'device-message', '设备消息', '/device-message', 'device:control', '下发设备消息', 290, 20, TRUE),

        ('TENANT', 'snmp', 'SNMP 接入', '/snmp', 'device:read', '查看 SNMP 接入', 300, 10, FALSE),
        ('TENANT', 'modbus', 'Modbus 接入', '/modbus', 'device:read', '查看 Modbus 接入', 310, 10, FALSE),
        ('TENANT', 'websocket', 'WebSocket 接入', '/websocket', 'device:read', '查看 WebSocket 接入', 320, 10, FALSE),
        ('TENANT', 'tcp-udp', 'TCP/UDP 接入', '/tcp-udp', 'device:read', '查看 TCP/UDP 接入', 330, 10, FALSE),
        ('TENANT', 'lorawan', 'LoRaWAN 接入', '/lorawan', 'device:read', '查看 LoRaWAN 接入', 340, 10, FALSE),

        ('TENANT', 'rule-engine', '规则引擎', '/rule-engine', 'rule:create', '创建规则', 350, 10, TRUE),
        ('TENANT', 'rule-engine', '规则引擎', '/rule-engine', 'rule:read', '查看规则', 350, 20, TRUE),
        ('TENANT', 'rule-engine', '规则引擎', '/rule-engine', 'rule:update', '编辑规则', 350, 30, TRUE),
        ('TENANT', 'rule-engine', '规则引擎', '/rule-engine', 'rule:delete', '删除规则', 350, 40, TRUE),
        ('TENANT', 'rule-engine', '规则引擎', '/rule-engine', 'rule:enable', '启停规则', 350, 50, TRUE),

        ('TENANT', 'alarm-rules', '告警规则', '/alarm-rules', 'alarm:create', '创建告警规则', 360, 10, TRUE),
        ('TENANT', 'alarm-rules', '告警规则', '/alarm-rules', 'alarm:read', '查看告警规则', 360, 20, TRUE),
        ('TENANT', 'alarm-rules', '告警规则', '/alarm-rules', 'alarm:update', '编辑告警规则', 360, 30, TRUE),
        ('TENANT', 'alarm-rules', '告警规则', '/alarm-rules', 'alarm:delete', '删除告警规则', 360, 40, TRUE),

        ('TENANT', 'alarm-recipient-groups', '告警接收组', '/alarm-recipient-groups', 'alarm:read', '查看告警接收组', 370, 10, TRUE),
        ('TENANT', 'alarm-recipient-groups', '告警接收组', '/alarm-recipient-groups', 'alarm:update', '维护告警接收组', 370, 20, TRUE),

        ('TENANT', 'alarm-records', '告警处理', '/alarm-records', 'alarm:read', '查看告警记录', 380, 10, TRUE),
        ('TENANT', 'alarm-records', '告警处理', '/alarm-records', 'alarm:confirm', '确认告警', 380, 20, TRUE),
        ('TENANT', 'alarm-records', '告警处理', '/alarm-records', 'alarm:process', '处理告警', 380, 30, TRUE),

        ('TENANT', 'notification-records', '通知记录', '/notification-records', 'notification:read', '查看通知记录', 390, 10, TRUE),

        ('TENANT', 'message-template', '消息模板', '/message-template', 'message-template:create', '创建消息模板', 400, 10, TRUE),
        ('TENANT', 'message-template', '消息模板', '/message-template', 'message-template:read', '查看消息模板', 400, 20, TRUE),
        ('TENANT', 'message-template', '消息模板', '/message-template', 'message-template:update', '编辑消息模板', 400, 30, TRUE),
        ('TENANT', 'message-template', '消息模板', '/message-template', 'message-template:delete', '删除消息模板', 400, 40, TRUE),

        ('TENANT', 'device-data', '设备数据', '/device-data', 'data:read', '查看设备数据', 410, 10, TRUE),

        ('TENANT', 'analysis', '数据分析', '/analysis', 'analysis:read', '查看分析结果', 420, 10, TRUE),
        ('TENANT', 'analysis', '数据分析', '/analysis', 'analysis:export', '导出分析结果', 420, 20, TRUE),

        ('TENANT', 'device-log', '设备日志', '/device-log', 'device-log:read', '查看设备日志', 430, 10, TRUE),
        ('TENANT', 'device-log', '设备日志', '/device-log', 'device-log:delete', '清理设备日志', 430, 20, TRUE),

        ('TENANT', 'export', '异步任务', '/export', 'export:create', '创建异步任务', 440, 10, TRUE),
        ('TENANT', 'export', '异步任务', '/export', 'export:read', '查看异步任务', 440, 20, TRUE),
        ('TENANT', 'export', '异步任务', '/export', 'export:update', '取消异步任务', 440, 30, TRUE),
        ('TENANT', 'export', '异步任务', '/export', 'export:delete', '清理异步任务', 440, 40, TRUE),

        ('TENANT', 'firmware', '固件管理', '/firmware', 'firmware:read', '查看固件绑定', 450, 10, TRUE),
        ('TENANT', 'firmware', '固件管理', '/firmware', 'firmware:update', '维护固件绑定', 450, 20, TRUE),

        ('TENANT', 'ota', 'OTA 升级', '/ota', 'ota:read', '查看 OTA', 460, 10, TRUE),
        ('TENANT', 'ota', 'OTA 升级', '/ota', 'ota:upload', '上传固件', 460, 20, TRUE),
        ('TENANT', 'ota', 'OTA 升级', '/ota', 'ota:deploy', '下发升级', 460, 30, TRUE),
        ('TENANT', 'ota', 'OTA 升级', '/ota', 'ota:delete', '删除固件或任务', 460, 40, TRUE),

        ('TENANT', 'video', '视频监控', '/video', 'video:create', '创建视频设备', 470, 10, TRUE),
        ('TENANT', 'video', '视频监控', '/video', 'video:read', '查看视频设备', 470, 20, TRUE),
        ('TENANT', 'video', '视频监控', '/video', 'video:update', '编辑视频设备', 470, 30, TRUE),
        ('TENANT', 'video', '视频监控', '/video', 'video:delete', '删除视频设备', 470, 40, TRUE),
        ('TENANT', 'video', '视频监控', '/video', 'video:stream', '推拉流与截图', 470, 50, TRUE),
        ('TENANT', 'video', '视频监控', '/video', 'video:ptz', '云台控制', 470, 60, TRUE),
        ('TENANT', 'video', '视频监控', '/video', 'video:record', '录像控制', 470, 70, TRUE)
)
INSERT INTO workspace_menu_permission_catalog (
    workspace_scope,
    module_key,
    module_label,
    menu_path,
    permission_code,
    permission_label,
    module_sort_order,
    permission_sort_order,
    role_catalog_visible
)
SELECT
    workspace_scope,
    module_key,
    module_label,
    menu_path,
    permission_code,
    permission_label,
    module_sort_order,
    permission_sort_order,
    role_catalog_visible
FROM seed
ON CONFLICT (workspace_scope, module_key, permission_code) DO UPDATE
SET module_label = EXCLUDED.module_label,
    menu_path = EXCLUDED.menu_path,
    permission_label = EXCLUDED.permission_label,
    module_sort_order = EXCLUDED.module_sort_order,
    permission_sort_order = EXCLUDED.permission_sort_order,
    role_catalog_visible = EXCLUDED.role_catalog_visible,
    updated_at = CURRENT_TIMESTAMP;
