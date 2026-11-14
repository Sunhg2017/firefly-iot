-- ============================================================
-- 遥测写入放大治理：消息原始 payload 按消息只存一份
-- 原实现把整包 payload 复制到每条属性记录（raw_payload），多属性消息放大 N 倍
-- ============================================================

CREATE TABLE IF NOT EXISTS device_telemetry_payload (
    tenant_id   BIGINT NOT NULL,
    device_id   BIGINT NOT NULL,
    message_id  VARCHAR(64) NOT NULL,
    ts          TIMESTAMPTZ NOT NULL,
    payload     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_telemetry_payload
    ON device_telemetry_payload (tenant_id, device_id, message_id);

CREATE INDEX IF NOT EXISTS idx_telemetry_payload_ts ON device_telemetry_payload (ts);

COMMENT ON TABLE device_telemetry_payload IS '设备遥测消息原始 payload，一条消息一行，避免按属性行重复存储';
