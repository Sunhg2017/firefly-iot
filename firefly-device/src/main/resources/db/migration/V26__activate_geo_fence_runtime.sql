-- Activate geo-fence runtime by making location records tenant-aware.

ALTER TABLE device_locations
    ADD COLUMN IF NOT EXISTS tenant_id BIGINT;

UPDATE device_locations dl
SET tenant_id = d.tenant_id
FROM devices d
WHERE dl.device_id = d.id
  AND dl.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_device_locations_tenant_device
    ON device_locations (tenant_id, device_id, reported_at DESC);

COMMENT ON COLUMN device_locations.tenant_id IS '租户ID';
