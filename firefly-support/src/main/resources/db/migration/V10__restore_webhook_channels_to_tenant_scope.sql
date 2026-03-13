-- ============================================================
-- Restore webhook channels from platform default scope back to
-- the system operations tenant, so WEBHOOK remains tenant-level.
-- ============================================================

DO $$
DECLARE
    v_system_ops_tenant_id BIGINT;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'tenants'
    ) THEN
        SELECT id
        INTO v_system_ops_tenant_id
        FROM tenants
        WHERE code = 'system-ops'
        LIMIT 1;

        IF v_system_ops_tenant_id IS NOT NULL THEN
            UPDATE notification_channels
            SET tenant_id = v_system_ops_tenant_id
            WHERE tenant_id = 0
              AND type = 'WEBHOOK';
        END IF;
    END IF;
END $$;
