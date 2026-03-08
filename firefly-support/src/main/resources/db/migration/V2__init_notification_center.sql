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
COMMENT ON COLUMN message_templates.channel IS '渠道: SMS/EMAIL/WEBHOOK/PUSH/WECHAT';
COMMENT ON COLUMN message_templates.template_type IS '模板类型: TEXT/HTML/MARKDOWN';
COMMENT ON COLUMN message_templates.variables IS '变量定义JSON，如 [{"name":"deviceName","desc":"设备名称"}]';

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

-- 默认通知模板种子数据
INSERT INTO notification_templates (tenant_id, code, name, channel, subject, content, variables)
VALUES
    (0, 'ALARM_EMAIL', '告警邮件通知', 'EMAIL', '【${platform_name}】告警通知 - ${alarm_level}', '设备 ${device_name} (${device_id}) 触发告警：\n\n告警级别：${alarm_level}\n告警规则：${rule_name}\n告警内容：${alarm_content}\n告警时间：${alarm_time}\n\n请及时处理。', 'platform_name,device_name,device_id,alarm_level,rule_name,alarm_content,alarm_time'),
    (0, 'ALARM_SMS', '告警短信通知', 'SMS', NULL, '【${platform_name}】设备${device_name}触发${alarm_level}告警：${alarm_content}，请及时处理。', 'platform_name,device_name,alarm_level,alarm_content'),
    (0, 'ALARM_WEBHOOK', '告警 Webhook 通知', 'WEBHOOK', NULL, '{"event":"alarm","deviceName":"${device_name}","deviceId":"${device_id}","level":"${alarm_level}","rule":"${rule_name}","content":"${alarm_content}","time":"${alarm_time}"}', 'device_name,device_id,alarm_level,rule_name,alarm_content,alarm_time'),
    (0, 'OTA_COMPLETE', 'OTA 升级完成通知', 'EMAIL', '【${platform_name}】OTA 升级完成', '设备 ${device_name} (${device_id}) 已完成 OTA 升级。\n\n固件版本：${firmware_version}\n升级结果：${result}\n完成时间：${complete_time}', 'platform_name,device_name,device_id,firmware_version,result,complete_time'),
    (0, 'DEVICE_OFFLINE', '设备离线通知', 'EMAIL', '【${platform_name}】设备离线告警', '设备 ${device_name} (${device_id}) 已离线。\n\n最后在线时间：${last_online_time}\n所属产品：${product_name}\n\n请检查设备网络和供电状态。', 'platform_name,device_name,device_id,last_online_time,product_name')
ON CONFLICT DO NOTHING;
