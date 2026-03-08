-- =============================================================
-- V24: 权限资源定义表
-- =============================================================

CREATE TABLE IF NOT EXISTS permission_resources (
    id              BIGSERIAL PRIMARY KEY,
    parent_id       BIGINT NOT NULL DEFAULT 0,
    code            VARCHAR(100) NOT NULL UNIQUE,
    name            VARCHAR(200) NOT NULL,
    type            VARCHAR(20) NOT NULL DEFAULT 'MENU',
    icon            VARCHAR(100),
    path            VARCHAR(300),
    sort_order      INT NOT NULL DEFAULT 0,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    description     VARCHAR(500),
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perm_resources_parent ON permission_resources (parent_id);
CREATE INDEX IF NOT EXISTS idx_perm_resources_type ON permission_resources (type);
CREATE INDEX IF NOT EXISTS idx_perm_resources_sort ON permission_resources (sort_order);

COMMENT ON TABLE permission_resources IS '权限资源定义表（菜单/按钮/API权限树）';
COMMENT ON COLUMN permission_resources.type IS '资源类型: MENU/BUTTON/API';
COMMENT ON COLUMN permission_resources.code IS '权限编码，如 device:read, alarm:create';
COMMENT ON COLUMN permission_resources.path IS '前端路由路径或API路径';
