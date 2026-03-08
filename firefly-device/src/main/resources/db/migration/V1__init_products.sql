-- ============================================================
-- 产品表（替代 V1 中简单的 projects 表内产品概念）
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL,
    project_id          BIGINT,
    product_key         VARCHAR(32) NOT NULL UNIQUE,
    product_secret      VARCHAR(64),
    name                VARCHAR(256) NOT NULL,
    description         TEXT,
    category            VARCHAR(32) NOT NULL DEFAULT 'OTHER',
    protocol            VARCHAR(32) NOT NULL DEFAULT 'MQTT',
    thing_model         JSONB DEFAULT '{"properties":[],"events":[],"services":[]}',
    node_type           VARCHAR(16) NOT NULL DEFAULT 'DEVICE',
    data_format         VARCHAR(16) NOT NULL DEFAULT 'JSON',
    status              VARCHAR(16) NOT NULL DEFAULT 'DEVELOPMENT',
    device_count        INT NOT NULL DEFAULT 0,
    created_by          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_project ON products(project_id);
CREATE INDEX IF NOT EXISTS idx_products_key ON products(product_key);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(tenant_id, category);
