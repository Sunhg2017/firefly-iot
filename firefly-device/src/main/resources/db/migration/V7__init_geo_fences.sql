-- =============================================================
-- V19: 地理围栏 + 设备位置
-- =============================================================

CREATE TABLE IF NOT EXISTS geo_fences (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    fence_type      VARCHAR(20) NOT NULL DEFAULT 'CIRCLE',
    coordinates     TEXT,
    center_lng      DOUBLE PRECISION,
    center_lat      DOUBLE PRECISION,
    radius          DOUBLE PRECISION,
    trigger_type    VARCHAR(20) NOT NULL DEFAULT 'BOTH',
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      BIGINT,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geo_fences_tenant ON geo_fences (tenant_id);
CREATE INDEX IF NOT EXISTS idx_geo_fences_enabled ON geo_fences (tenant_id, enabled);

COMMENT ON TABLE geo_fences IS '地理围栏表';
COMMENT ON COLUMN geo_fences.fence_type IS '围栏类型: CIRCLE/POLYGON';
COMMENT ON COLUMN geo_fences.coordinates IS '多边形坐标: lng1,lat1;lng2,lat2;...';
COMMENT ON COLUMN geo_fences.trigger_type IS '触发类型: ENTER/LEAVE/BOTH';

-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS device_locations (
    id              BIGSERIAL PRIMARY KEY,
    device_id       BIGINT NOT NULL,
    lng             DOUBLE PRECISION NOT NULL,
    lat             DOUBLE PRECISION NOT NULL,
    altitude        DOUBLE PRECISION,
    speed           DOUBLE PRECISION,
    heading         DOUBLE PRECISION,
    source          VARCHAR(20) DEFAULT 'GPS',
    reported_at     TIMESTAMP NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_locations_device ON device_locations (device_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_locations_time ON device_locations (reported_at);

COMMENT ON TABLE device_locations IS '设备位置记录表';
COMMENT ON COLUMN device_locations.source IS '定位来源: GPS/WIFI/LBS/IP';
