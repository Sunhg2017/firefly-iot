-- =============================================================
-- V16: 项目成员 + 项目设备绑定
-- =============================================================

CREATE TABLE IF NOT EXISTS project_members (
    id              BIGSERIAL PRIMARY KEY,
    project_id      BIGINT NOT NULL,
    user_id         BIGINT NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members (project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members (user_id);

COMMENT ON TABLE project_members IS '项目成员表';
COMMENT ON COLUMN project_members.role IS '成员角色: OWNER/ADMIN/MEMBER/VIEWER';

-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project_devices (
    id              BIGSERIAL PRIMARY KEY,
    project_id      BIGINT NOT NULL,
    device_id       BIGINT NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (project_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_project_devices_project ON project_devices (project_id);
CREATE INDEX IF NOT EXISTS idx_project_devices_device ON project_devices (device_id);

COMMENT ON TABLE project_devices IS '项目设备绑定表';
