-- =============================================================
-- V12: Tenant menu configuration (租户自定义菜单)
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant_menu_configs (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    parent_id       BIGINT DEFAULT 0,
    menu_key        VARCHAR(100) NOT NULL,
    label           VARCHAR(100) NOT NULL,
    icon            VARCHAR(100),
    route_path      VARCHAR(200),
    sort_order      INT NOT NULL DEFAULT 0,
    visible         BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      BIGINT,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_menu_configs_tenant ON tenant_menu_configs (tenant_id, parent_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS uk_tenant_menu_configs_key ON tenant_menu_configs (tenant_id, menu_key);

COMMENT ON TABLE tenant_menu_configs IS '租户自定义菜单配置表';
COMMENT ON COLUMN tenant_menu_configs.parent_id IS '父菜单ID，0 表示顶级';
COMMENT ON COLUMN tenant_menu_configs.menu_key IS '菜单唯一标识，对应 routeConfigs 中的 path 或 group key';
COMMENT ON COLUMN tenant_menu_configs.label IS '菜单显示名称';
COMMENT ON COLUMN tenant_menu_configs.icon IS '图标名称（Ant Design icon name）';
COMMENT ON COLUMN tenant_menu_configs.route_path IS '路由路径，分组菜单为 null';
COMMENT ON COLUMN tenant_menu_configs.sort_order IS '排序序号，越小越靠前';
COMMENT ON COLUMN tenant_menu_configs.visible IS '是否显示';
