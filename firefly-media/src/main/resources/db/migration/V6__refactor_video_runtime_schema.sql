DROP TABLE IF EXISTS stream_sessions CASCADE;
DROP TABLE IF EXISTS video_channels CASCADE;
DROP TABLE IF EXISTS video_devices CASCADE;

CREATE TABLE IF NOT EXISTS stream_sessions (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL,
    device_id           BIGINT NOT NULL,
    channel_id          VARCHAR(64),
    stream_id           VARCHAR(256),
    status              VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    flv_url             VARCHAR(1024),
    hls_url             VARCHAR(1024),
    webrtc_url          VARCHAR(1024),
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    stopped_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stream_sessions_device
    ON stream_sessions(device_id);

CREATE INDEX IF NOT EXISTS idx_stream_sessions_status
    ON stream_sessions(tenant_id, status);
