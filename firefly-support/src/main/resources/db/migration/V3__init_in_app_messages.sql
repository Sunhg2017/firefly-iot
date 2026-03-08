-- =============================================================
-- V3: In-app messages (站内信)
-- =============================================================

CREATE TABLE IF NOT EXISTS in_app_messages (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    user_id         BIGINT NOT NULL,
    title           VARCHAR(200) NOT NULL,
    content         TEXT NOT NULL,
    type            VARCHAR(30) NOT NULL DEFAULT 'SYSTEM',
    level           VARCHAR(20) NOT NULL DEFAULT 'INFO',
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMP,
    source          VARCHAR(100),
    source_id       VARCHAR(100),
    created_by      BIGINT,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_in_app_messages_user ON in_app_messages (tenant_id, user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_in_app_messages_type ON in_app_messages (tenant_id, user_id, type);

COMMENT ON TABLE in_app_messages IS '站内信表';
COMMENT ON COLUMN in_app_messages.type IS '消息类型: SYSTEM/ALARM/DEVICE/OTA/TASK';
COMMENT ON COLUMN in_app_messages.level IS '消息级别: INFO/WARNING/ERROR';
COMMENT ON COLUMN in_app_messages.source IS '来源模块（如 alarm_rule, ota_task）';
COMMENT ON COLUMN in_app_messages.source_id IS '来源关联ID';
