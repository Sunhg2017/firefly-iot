ALTER TABLE protocol_parser_definitions
    ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE protocol_parser_definitions
    ADD COLUMN IF NOT EXISTS visual_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS release_mode VARCHAR(16) NOT NULL DEFAULT 'ALL',
    ADD COLUMN IF NOT EXISTS release_config_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ppd_scope_status
    ON protocol_parser_definitions(tenant_id, scope_type, scope_id, status)
    WHERE deleted_at IS NULL;
