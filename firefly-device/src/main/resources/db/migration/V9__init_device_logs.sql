-- =============================================================
-- V22: 设备运行日志表
-- =============================================================

CREATE TABLE IF NOT EXISTS device_logs (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    device_id       BIGINT NOT NULL,
    product_id      BIGINT,
    level           VARCHAR(10) NOT NULL DEFAULT 'INFO',
    module          VARCHAR(100),
    content         TEXT NOT NULL,
    trace_id        VARCHAR(64),
    ip              VARCHAR(50),
    reported_at     TIMESTAMP NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_logs_tenant ON device_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_device_logs_device ON device_logs (device_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_logs_level ON device_logs (level);
CREATE INDEX IF NOT EXISTS idx_device_logs_product ON device_logs (product_id);
CREATE INDEX IF NOT EXISTS idx_device_logs_time ON device_logs (reported_at);
CREATE INDEX IF NOT EXISTS idx_device_logs_trace ON device_logs (trace_id);

COMMENT ON TABLE device_logs IS '设备运行日志表';
COMMENT ON COLUMN device_logs.level IS '日志级别: DEBUG/INFO/WARN/ERROR';
COMMENT ON COLUMN device_logs.module IS '模块名称，如 connectivity/property/event/ota';
COMMENT ON COLUMN device_logs.trace_id IS '链路追踪ID';
