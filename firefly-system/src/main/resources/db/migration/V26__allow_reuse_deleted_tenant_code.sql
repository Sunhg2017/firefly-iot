-- Allow reusing tenant code after logical deletion.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS uk_tenants_code_active
    ON tenants (code)
    WHERE deleted_at IS NULL;
