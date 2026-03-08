-- ============================================================
-- V13: split system operations users and tenant users
-- ============================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS user_type VARCHAR(32) NOT NULL DEFAULT 'TENANT_USER';

ALTER TABLE users
    ALTER COLUMN user_type SET DEFAULT 'TENANT_USER';

ALTER TABLE users
    ALTER COLUMN user_type SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_tenant_user_type
    ON users (tenant_id, user_type);
