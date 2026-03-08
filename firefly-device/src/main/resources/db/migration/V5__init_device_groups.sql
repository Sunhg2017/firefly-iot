-- =============================================================
-- V17: 设备分组 + 分组成员
-- =============================================================

CREATE TABLE IF NOT EXISTS device_groups (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    type            VARCHAR(20) NOT NULL DEFAULT 'STATIC',
    dynamic_rule    TEXT,
    parent_id       BIGINT,
    device_count    INT NOT NULL DEFAULT 0,
    created_by      BIGINT,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_groups_tenant ON device_groups (tenant_id);
CREATE INDEX IF NOT EXISTS idx_device_groups_parent ON device_groups (parent_id);

COMMENT ON TABLE device_groups IS '设备分组表';
COMMENT ON COLUMN device_groups.type IS '分组类型: STATIC/DYNAMIC';
COMMENT ON COLUMN device_groups.dynamic_rule IS '动态分组规则 JSON';

-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS device_group_members (
    id              BIGSERIAL PRIMARY KEY,
    group_id        BIGINT NOT NULL,
    device_id       BIGINT NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (group_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_group_members_group ON device_group_members (group_id);
CREATE INDEX IF NOT EXISTS idx_device_group_members_device ON device_group_members (device_id);

COMMENT ON TABLE device_group_members IS '设备分组成员表';
