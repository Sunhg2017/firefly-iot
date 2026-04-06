-- ============================================================
-- Remove tenant plan and quota model, and clean stale permissions.
-- ============================================================

DROP INDEX IF EXISTS idx_tenants_plan;

ALTER TABLE tenants
    DROP COLUMN IF EXISTS plan;

DROP TABLE IF EXISTS tenant_quotas;

UPDATE permission_groups
SET permissions = '["tenant:read","tenant:manage"]'
WHERE code = 'TENANT'
  AND permissions = '["tenant:read","tenant:manage","tenant:quota","tenant:billing"]';
