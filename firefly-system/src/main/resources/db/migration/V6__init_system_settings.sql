-- =============================================================
-- V13: 系统设置
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
