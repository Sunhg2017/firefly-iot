-- =============================================================
-- V18: 设备标签 + 标签绑定
-- =============================================================

CREATE TABLE IF NOT EXISTS device_tags (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    tag_key         VARCHAR(100) NOT NULL,
    tag_value       VARCHAR(200) NOT NULL,
    color           VARCHAR(20) DEFAULT '#1890ff',
    description     VARCHAR(500),
    device_count    INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, tag_key, tag_value)
);

CREATE INDEX IF NOT EXISTS idx_device_tags_tenant ON device_tags (tenant_id);
CREATE INDEX IF NOT EXISTS idx_device_tags_key ON device_tags (tag_key);

COMMENT ON TABLE device_tags IS '设备标签表';
COMMENT ON COLUMN device_tags.tag_key IS '标签键，如 env/region/type';
COMMENT ON COLUMN device_tags.tag_value IS '标签值，如 production/cn-east/sensor';

-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS device_tag_bindings (
    id              BIGSERIAL PRIMARY KEY,
    tag_id          BIGINT NOT NULL,
    device_id       BIGINT NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (tag_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_tag_bindings_tag ON device_tag_bindings (tag_id);
CREATE INDEX IF NOT EXISTS idx_device_tag_bindings_device ON device_tag_bindings (device_id);

COMMENT ON TABLE device_tag_bindings IS '设备标签绑定表';
