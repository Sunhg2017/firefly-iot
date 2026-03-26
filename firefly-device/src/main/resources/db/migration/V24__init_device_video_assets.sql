CREATE TABLE IF NOT EXISTS device_video_profiles (
    device_id           BIGINT PRIMARY KEY REFERENCES devices(id),
    tenant_id           BIGINT NOT NULL,
    stream_mode         VARCHAR(16) NOT NULL,
    gb_device_id        VARCHAR(64),
    gb_domain           VARCHAR(64),
    transport           VARCHAR(16) NOT NULL DEFAULT 'UDP',
    sip_password        VARCHAR(128),
    ip                  VARCHAR(64),
    port                INT,
    source_url          VARCHAR(1024),
    manufacturer        VARCHAR(128),
    model               VARCHAR(128),
    firmware            VARCHAR(64),
    status              VARCHAR(16) NOT NULL DEFAULT 'OFFLINE',
    last_registered_at  TIMESTAMPTZ,
    created_by          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_video_profiles_tenant
    ON device_video_profiles(tenant_id);

CREATE INDEX IF NOT EXISTS idx_device_video_profiles_status
    ON device_video_profiles(tenant_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uk_device_video_profiles_tenant_gb_device
    ON device_video_profiles(tenant_id, gb_device_id)
    WHERE gb_device_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uk_device_video_profiles_tenant_mode_source
    ON device_video_profiles(tenant_id, stream_mode, source_url)
    WHERE source_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS device_video_channels (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL,
    device_id           BIGINT NOT NULL REFERENCES devices(id),
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
    CONSTRAINT uk_device_video_channel UNIQUE (device_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_device_video_channels_tenant
    ON device_video_channels(tenant_id);

CREATE INDEX IF NOT EXISTS idx_device_video_channels_device
    ON device_video_channels(device_id);
