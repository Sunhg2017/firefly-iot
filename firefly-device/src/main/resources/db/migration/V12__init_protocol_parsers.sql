CREATE TABLE IF NOT EXISTS protocol_parser_definitions (
    id                 BIGSERIAL PRIMARY KEY,
    tenant_id          BIGINT NOT NULL,
    product_id         BIGINT NOT NULL,
    scope_type         VARCHAR(16) NOT NULL DEFAULT 'PRODUCT',
    scope_id           BIGINT NOT NULL,
    protocol           VARCHAR(32) NOT NULL,
    transport          VARCHAR(32) NOT NULL,
    direction          VARCHAR(16) NOT NULL DEFAULT 'UPLINK',
    parser_mode        VARCHAR(16) NOT NULL DEFAULT 'SCRIPT',
    frame_mode         VARCHAR(16) NOT NULL DEFAULT 'NONE',
    match_rule_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
    frame_config_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
    parser_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    script_language    VARCHAR(16),
    script_content     TEXT,
    plugin_id          VARCHAR(128),
    plugin_version     VARCHAR(64),
    timeout_ms         INT NOT NULL DEFAULT 50,
    error_policy       VARCHAR(16) NOT NULL DEFAULT 'ERROR',
    status             VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    current_version    INT NOT NULL DEFAULT 1,
    published_version  INT,
    created_by         BIGINT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ppd_product
    ON protocol_parser_definitions(product_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ppd_scope
    ON protocol_parser_definitions(scope_type, scope_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ppd_protocol
    ON protocol_parser_definitions(protocol, transport, direction)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS protocol_parser_versions (
    id              BIGSERIAL PRIMARY KEY,
    definition_id   BIGINT NOT NULL REFERENCES protocol_parser_definitions(id),
    version_no      INT NOT NULL,
    snapshot_json   JSONB NOT NULL,
    publish_status  VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    change_log      TEXT,
    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (definition_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_ppv_definition
    ON protocol_parser_versions(definition_id, version_no);

CREATE TABLE IF NOT EXISTS device_locators (
    id            BIGSERIAL PRIMARY KEY,
    tenant_id     BIGINT NOT NULL,
    product_id     BIGINT NOT NULL,
    device_id      BIGINT NOT NULL,
    locator_type   VARCHAR(32) NOT NULL,
    locator_value  VARCHAR(256) NOT NULL,
    is_primary     BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_device_locator
    ON device_locators(product_id, locator_type, locator_value)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_device_locator_device
    ON device_locators(device_id)
    WHERE deleted_at IS NULL;
