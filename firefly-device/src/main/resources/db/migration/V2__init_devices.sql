-- ============================================================
-- 设备表
-- ============================================================
CREATE TABLE IF NOT EXISTS devices (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL,
    product_id          BIGINT NOT NULL REFERENCES products(id),
    project_id          BIGINT,
    device_name         VARCHAR(64) NOT NULL,
    device_secret       VARCHAR(64) NOT NULL,
    nickname            VARCHAR(256),
    description         TEXT,
    status              VARCHAR(16) NOT NULL DEFAULT 'INACTIVE',
    online_status       VARCHAR(16) NOT NULL DEFAULT 'OFFLINE',
    firmware_version    VARCHAR(64),
    ip_address          VARCHAR(45),
    tags                JSONB DEFAULT '{}',
    gateway_id          BIGINT REFERENCES devices(id),
    last_online_at      TIMESTAMPTZ,
    last_offline_at     TIMESTAMPTZ,
    activated_at        TIMESTAMPTZ,
    created_by          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT uk_device_product_name UNIQUE (product_id, device_name)
);

CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_product ON devices(product_id);
CREATE INDEX IF NOT EXISTS idx_devices_project ON devices(project_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_devices_online ON devices(tenant_id, online_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_devices_gateway ON devices(gateway_id);
CREATE INDEX IF NOT EXISTS idx_devices_tags ON devices USING gin(tags);

