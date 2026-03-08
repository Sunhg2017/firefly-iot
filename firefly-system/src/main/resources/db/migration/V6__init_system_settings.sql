-- =============================================================
-- V13: 系统设置 + 通知模板
-- =============================================================

CREATE TABLE IF NOT EXISTS system_configs (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    config_group    VARCHAR(50) NOT NULL DEFAULT 'default',
    config_key      VARCHAR(100) NOT NULL,
    config_value    TEXT,
    value_type      VARCHAR(20) NOT NULL DEFAULT 'STRING',
    description     VARCHAR(500),
    updated_by      BIGINT,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, config_key)
);

CREATE INDEX IF NOT EXISTS idx_system_configs_tenant ON system_configs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_system_configs_group ON system_configs (tenant_id, config_group);

COMMENT ON TABLE system_configs IS '系统配置表（KV 存储）';
COMMENT ON COLUMN system_configs.config_group IS '配置分组: platform/notification/security/...';
COMMENT ON COLUMN system_configs.value_type IS '值类型: STRING/NUMBER/BOOLEAN/JSON';

-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notification_templates (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    code            VARCHAR(100) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    channel         VARCHAR(20) NOT NULL,
    subject         VARCHAR(500),
    content         TEXT NOT NULL,
    variables       VARCHAR(1000),
    enabled         BOOLEAN NOT NULL DEFAULT true,
    updated_by      BIGINT,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_tenant ON notification_templates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_templates_channel ON notification_templates (tenant_id, channel);

COMMENT ON TABLE notification_templates IS '通知模板表';
COMMENT ON COLUMN notification_templates.code IS '模板编码（唯一标识）';
COMMENT ON COLUMN notification_templates.channel IS '通知渠道: EMAIL/SMS/WEBHOOK/DINGTALK/WECHAT';
COMMENT ON COLUMN notification_templates.variables IS '变量列表（逗号分隔）';

-- ---------------------------------------------------------------
-- 默认平台配置种子数据（tenant_id=0 为全局默认）
-- ---------------------------------------------------------------

INSERT INTO system_configs (tenant_id, config_group, config_key, config_value, value_type, description)
VALUES
    (0, 'platform', 'platform.name', 'Firefly IoT', 'STRING', '平台名称'),
    (0, 'platform', 'platform.logo', '', 'STRING', '平台 Logo URL'),
    (0, 'platform', 'platform.footer', 'Firefly IoT Platform © 2025', 'STRING', '页脚文字'),
    (0, 'security', 'security.password.min_length', '8', 'NUMBER', '密码最小长度'),
    (0, 'security', 'security.password.require_uppercase', 'true', 'BOOLEAN', '密码是否要求大写字母'),
    (0, 'security', 'security.password.require_number', 'true', 'BOOLEAN', '密码是否要求数字'),
    (0, 'security', 'security.session.max_concurrent', '5', 'NUMBER', '最大同时在线会话数'),
    (0, 'security', 'security.session.timeout_minutes', '1440', 'NUMBER', '会话超时（分钟）'),
    (0, 'security', 'security.login.max_attempts', '5', 'NUMBER', '最大登录失败次数'),
    (0, 'security', 'security.login.lock_minutes', '30', 'NUMBER', '登录锁定时长（分钟）'),
    (0, 'notification', 'notification.email.enabled', 'false', 'BOOLEAN', '邮件通知是否启用'),
    (0, 'notification', 'notification.email.smtp_host', '', 'STRING', 'SMTP 服务器'),
    (0, 'notification', 'notification.email.smtp_port', '465', 'NUMBER', 'SMTP 端口'),
    (0, 'notification', 'notification.email.from', '', 'STRING', '发件人地址'),
    (0, 'notification', 'notification.sms.enabled', 'false', 'BOOLEAN', '短信通知是否启用'),
    (0, 'notification', 'notification.webhook.enabled', 'false', 'BOOLEAN', 'Webhook 通知是否启用')
ON CONFLICT DO NOTHING;

-- 默认通知模板
INSERT INTO notification_templates (tenant_id, code, name, channel, subject, content, variables)
VALUES
    (0, 'ALARM_EMAIL', '告警邮件通知', 'EMAIL', '【${platform_name}】告警通知 - ${alarm_level}', '设备 ${device_name} (${device_id}) 触发告警：\n\n告警级别：${alarm_level}\n告警规则：${rule_name}\n告警内容：${alarm_content}\n告警时间：${alarm_time}\n\n请及时处理。', 'platform_name,device_name,device_id,alarm_level,rule_name,alarm_content,alarm_time'),
    (0, 'ALARM_SMS', '告警短信通知', 'SMS', NULL, '【${platform_name}】设备${device_name}触发${alarm_level}告警：${alarm_content}，请及时处理。', 'platform_name,device_name,alarm_level,alarm_content'),
    (0, 'ALARM_WEBHOOK', '告警 Webhook 通知', 'WEBHOOK', NULL, '{"event":"alarm","deviceName":"${device_name}","deviceId":"${device_id}","level":"${alarm_level}","rule":"${rule_name}","content":"${alarm_content}","time":"${alarm_time}"}', 'device_name,device_id,alarm_level,rule_name,alarm_content,alarm_time'),
    (0, 'OTA_COMPLETE', 'OTA 升级完成通知', 'EMAIL', '【${platform_name}】OTA 升级完成', '设备 ${device_name} (${device_id}) 已完成 OTA 升级。\n\n固件版本：${firmware_version}\n升级结果：${result}\n完成时间：${complete_time}', 'platform_name,device_name,device_id,firmware_version,result,complete_time'),
    (0, 'DEVICE_OFFLINE', '设备离线通知', 'EMAIL', '【${platform_name}】设备离线告警', '设备 ${device_name} (${device_id}) 已离线。\n\n最后在线时间：${last_online_time}\n所属产品：${product_name}\n\n请检查设备网络和供电状态。', 'platform_name,device_name,device_id,last_online_time,product_name')
ON CONFLICT DO NOTHING;
