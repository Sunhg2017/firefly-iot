-- =============================================================
-- V25: 数据字典表
-- =============================================================

CREATE TABLE IF NOT EXISTS dict_types (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    code            VARCHAR(100) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    is_system       BOOLEAN NOT NULL DEFAULT FALSE,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    description     VARCHAR(500),
    created_by      BIGINT,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_dict_types_tenant ON dict_types (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dict_types_code ON dict_types (code);

CREATE TABLE IF NOT EXISTS dict_items (
    id              BIGSERIAL PRIMARY KEY,
    dict_type_id    BIGINT NOT NULL,
    item_value      VARCHAR(200) NOT NULL,
    item_label      VARCHAR(200) NOT NULL,
    item_label2     VARCHAR(200),
    sort_order      INT NOT NULL DEFAULT 0,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    css_class       VARCHAR(100),
    description     VARCHAR(500),
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dict_items_type ON dict_items (dict_type_id);
CREATE INDEX IF NOT EXISTS idx_dict_items_sort ON dict_items (dict_type_id, sort_order);

COMMENT ON TABLE dict_types IS '数据字典类型表';
COMMENT ON TABLE dict_items IS '数据字典项表';
COMMENT ON COLUMN dict_types.is_system IS '系统内置字典不可删改';
COMMENT ON COLUMN dict_items.item_label2 IS '备用标签（如英文标签）';
COMMENT ON COLUMN dict_items.css_class IS '前端样式类名';
