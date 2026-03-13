-- =============================================================
-- V2: Notification center (merged from firefly-rule)
-- =============================================================

CREATE TABLE IF NOT EXISTS notification_channels (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    name            VARCHAR(200) NOT NULL,
    type            VARCHAR(20) NOT NULL,
    config          TEXT,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    created_by      BIGINT,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_channels_tenant ON notification_channels (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_channels_type ON notification_channels (tenant_id, type);

COMMENT ON TABLE notification_channels IS '通知渠道表';
COMMENT ON COLUMN notification_channels.type IS '渠道类型: EMAIL/SMS/WEBHOOK/DINGTALK/WECHAT';
COMMENT ON COLUMN notification_channels.config IS '渠道配置 JSON (SMTP/Webhook URL/API Key 等)';

-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notification_records (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    channel_id      BIGINT,
    channel_type    VARCHAR(20),
    template_code   VARCHAR(100),
    subject         VARCHAR(500),
    content         TEXT,
    recipient       VARCHAR(500),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    error_message   VARCHAR(500),
    retry_count     INT NOT NULL DEFAULT 0,
    sent_at         TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_records_tenant ON notification_records (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_records_status ON notification_records (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_notification_records_channel ON notification_records (tenant_id, channel_type);
CREATE INDEX IF NOT EXISTS idx_notification_records_created ON notification_records (tenant_id, created_at DESC);

COMMENT ON TABLE notification_records IS '通知发送记录表';
COMMENT ON COLUMN notification_records.status IS '发送状态: PENDING/SUCCESS/FAILED';
COMMENT ON COLUMN notification_records.recipient IS '接收方（邮箱/手机号/Webhook URL）';

-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS message_templates (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    code            VARCHAR(100) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    channel         VARCHAR(30) NOT NULL,
    template_type   VARCHAR(30) NOT NULL DEFAULT 'TEXT',
    subject         VARCHAR(500),
    content         TEXT NOT NULL,
    variables       TEXT,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    description     VARCHAR(500),
    created_by      BIGINT,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_message_templates_tenant ON message_templates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_channel ON message_templates (channel);
CREATE INDEX IF NOT EXISTS idx_message_templates_enabled ON message_templates (tenant_id, enabled);

COMMENT ON TABLE message_templates IS '消息模板表';
COMMENT ON COLUMN message_templates.code IS '模板编码，如 alarm_notify / device_offline';
COMMENT ON COLUMN message_templates.channel IS '渠道: SMS/EMAIL/PHONE/WEBHOOK/DINGTALK/WECHAT/IN_APP';
COMMENT ON COLUMN message_templates.template_type IS '模板类型: TEXT/HTML/MARKDOWN';
COMMENT ON COLUMN message_templates.variables IS '变量定义JSON，如 [{"name":"deviceName","desc":"设备名称"}]';

-- 默认消息模板种子数据
INSERT INTO message_templates (tenant_id, code, name, channel, template_type, subject, content, variables, enabled, description)
VALUES
    (0, 'ALARM_EMAIL', '告警邮件通知', 'EMAIL', 'TEXT', '【${platform_name}】告警通知 - ${alarm_level}', '设备 ${device_name} (${device_id}) 触发告警：\n\n告警级别：${alarm_level}\n告警规则：${rule_name}\n告警内容：${alarm_content}\n告警时间：${alarm_time}\n\n请及时处理。', '[{"name":"platform_name","desc":"平台名称"},{"name":"device_name","desc":"设备名称"},{"name":"device_id","desc":"设备编码"},{"name":"alarm_level","desc":"告警级别"},{"name":"rule_name","desc":"告警规则"},{"name":"alarm_content","desc":"告警内容"},{"name":"alarm_time","desc":"告警时间"}]', TRUE, '系统默认告警邮件模板'),
    (0, 'ALARM_SMS', '告警短信通知', 'SMS', 'TEXT', NULL, '【${platform_name}】设备${device_name}触发${alarm_level}告警：${alarm_content}，请及时处理。', '[{"name":"platform_name","desc":"平台名称"},{"name":"device_name","desc":"设备名称"},{"name":"alarm_level","desc":"告警级别"},{"name":"alarm_content","desc":"告警内容"}]', TRUE, '系统默认告警短信模板'),
    (0, 'ALARM_WEBHOOK', '告警 Webhook 通知', 'WEBHOOK', 'TEXT', NULL, '{"event":"alarm","deviceName":"${device_name}","deviceId":"${device_id}","level":"${alarm_level}","rule":"${rule_name}","content":"${alarm_content}","time":"${alarm_time}"}', '[{"name":"device_name","desc":"设备名称"},{"name":"device_id","desc":"设备编码"},{"name":"alarm_level","desc":"告警级别"},{"name":"rule_name","desc":"告警规则"},{"name":"alarm_content","desc":"告警内容"},{"name":"alarm_time","desc":"告警时间"}]', TRUE, '系统默认告警 Webhook 模板'),
    (0, 'OTA_COMPLETE', 'OTA 升级完成通知', 'EMAIL', 'TEXT', '【${platform_name}】OTA 升级完成', '设备 ${device_name} (${device_id}) 已完成 OTA 升级。\n\n固件版本：${firmware_version}\n升级结果：${result}\n完成时间：${complete_time}', '[{"name":"platform_name","desc":"平台名称"},{"name":"device_name","desc":"设备名称"},{"name":"device_id","desc":"设备编码"},{"name":"firmware_version","desc":"固件版本"},{"name":"result","desc":"升级结果"},{"name":"complete_time","desc":"完成时间"}]', TRUE, '系统默认 OTA 完成模板'),
    (0, 'DEVICE_OFFLINE', '设备离线通知', 'EMAIL', 'TEXT', '【${platform_name}】设备离线告警', '设备 ${device_name} (${device_id}) 已离线。\n\n最后在线时间：${last_online_time}\n所属产品：${product_name}\n\n请检查设备网络和供电状态。', '[{"name":"platform_name","desc":"平台名称"},{"name":"device_name","desc":"设备名称"},{"name":"device_id","desc":"设备编码"},{"name":"last_online_time","desc":"最后在线时间"},{"name":"product_name","desc":"产品名称"}]', TRUE, '系统默认设备离线模板')
ON CONFLICT (tenant_id, code) DO NOTHING;
