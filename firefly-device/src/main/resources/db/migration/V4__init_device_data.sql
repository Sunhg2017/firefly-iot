-- ============================================================
-- 设备遥测数据表 (TimescaleDB 超表)
-- ============================================================
CREATE TABLE IF NOT EXISTS device_telemetry (
    ts              TIMESTAMPTZ NOT NULL,
    tenant_id       BIGINT NOT NULL,
    device_id       BIGINT NOT NULL,
    product_id      BIGINT NOT NULL,
    property        VARCHAR(128) NOT NULL,
    value_number    DOUBLE PRECISION,
    value_string    VARCHAR(1024),
    value_bool      BOOLEAN,
    raw_payload     JSONB
);

-- 转为 TimescaleDB 超表（如未安装 TimescaleDB 扩展请注释此行）
-- SELECT create_hypertable('device_telemetry', 'ts', chunk_time_interval => INTERVAL '1 day');

CREATE INDEX IF NOT EXISTS idx_telemetry_device_ts ON device_telemetry(tenant_id, device_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_property ON device_telemetry(tenant_id, device_id, property, ts DESC);

-- ============================================================
-- 设备事件表
-- ============================================================
CREATE TABLE IF NOT EXISTS device_events (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    device_id       BIGINT NOT NULL,
    product_id      BIGINT NOT NULL,
    event_type      VARCHAR(64) NOT NULL,
    event_name      VARCHAR(256),
    level           VARCHAR(16) NOT NULL DEFAULT 'INFO',
    payload         JSONB,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_events_tenant ON device_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_device_events_device ON device_events(device_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_events_type ON device_events(tenant_id, event_type);
CREATE INDEX IF NOT EXISTS idx_device_events_level ON device_events(tenant_id, level);
