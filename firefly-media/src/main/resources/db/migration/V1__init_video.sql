-- ============================================================
-- 视频设备表
-- ============================================================
CREATE TABLE IF NOT EXISTS video_devices (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL,
    device_id           BIGINT,
    name                VARCHAR(256) NOT NULL,
    gb_device_id        VARCHAR(64),
    gb_domain           VARCHAR(64),
    transport           VARCHAR(16) NOT NULL DEFAULT 'UDP',
    stream_mode         VARCHAR(16) NOT NULL DEFAULT 'GB28181',
    ip                  VARCHAR(64),
    port                INT,
    manufacturer        VARCHAR(128),
    model               VARCHAR(128),
    firmware            VARCHAR(64),
    status              VARCHAR(16) NOT NULL DEFAULT 'OFFLINE',
    last_registered_at  TIMESTAMPTZ,
    created_by          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_devices_tenant ON video_devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_video_devices_status ON video_devices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_video_devices_gb ON video_devices(gb_device_id);

-- ============================================================
-- 视频通道表
-- ============================================================
CREATE TABLE IF NOT EXISTS video_channels (
    id                  BIGSERIAL PRIMARY KEY,
    video_device_id     BIGINT NOT NULL REFERENCES video_devices(id) ON DELETE CASCADE,
    channel_id          VARCHAR(64) NOT NULL,
    name                VARCHAR(256),
    manufacturer        VARCHAR(128),
    model               VARCHAR(128),
    status              VARCHAR(16) NOT NULL DEFAULT 'OFFLINE',
    ptz_type            INT DEFAULT 0,
    sub_count           INT DEFAULT 0,
    longitude           DOUBLE PRECISION,
    latitude            DOUBLE PRECISION,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_video_channel UNIQUE (video_device_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_video_channels_device ON video_channels(video_device_id);

-- ============================================================
-- 流会话表
-- ============================================================
CREATE TABLE IF NOT EXISTS stream_sessions (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL,
    video_device_id     BIGINT NOT NULL REFERENCES video_devices(id),
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

CREATE INDEX IF NOT EXISTS idx_stream_sessions_device ON stream_sessions(video_device_id);
CREATE INDEX IF NOT EXISTS idx_stream_sessions_status ON stream_sessions(tenant_id, status);
