-- ============================================================
-- Promote system operations notification channels to platform
-- default channels and reserve tenant_id = 0 as the global owner.
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
            SET tenant_id = 0
            WHERE tenant_id = v_system_ops_tenant_id;
        END IF;
    END IF;
END $$;
