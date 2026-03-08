-- ============================================================
-- 用户表
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
    username            VARCHAR(64) NOT NULL,
    password_hash       VARCHAR(256) NOT NULL,
    phone               VARCHAR(32),
    email               VARCHAR(256),
    avatar_url          VARCHAR(512),
    real_name           VARCHAR(128),
    status              VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    password_changed_at TIMESTAMPTZ,
    login_fail_count    INT NOT NULL DEFAULT 0,
    lock_until          TIMESTAMPTZ,
    created_by          BIGINT,
    last_login_at       TIMESTAMPTZ,
    last_login_ip       VARCHAR(45),
    last_login_platform VARCHAR(32),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(tenant_id, username) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- ============================================================
-- 角色表
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
    code                VARCHAR(64) NOT NULL,
    name                VARCHAR(128) NOT NULL,
    description         VARCHAR(512),
    type                VARCHAR(16) NOT NULL DEFAULT 'CUSTOM',
    data_scope          VARCHAR(16) NOT NULL DEFAULT 'PROJECT',
    data_scope_config   JSONB,
    is_system           BOOLEAN NOT NULL DEFAULT FALSE,
    status              VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_by          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_role_tenant_code UNIQUE (tenant_id, code)
);

-- ============================================================
-- 角色权限关联表
-- ============================================================
CREATE TABLE IF NOT EXISTS role_permissions (
    id              BIGSERIAL PRIMARY KEY,
    role_id         BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission      VARCHAR(128) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_role_permission UNIQUE (role_id, permission)
);
CREATE INDEX IF NOT EXISTS idx_role_perm_role ON role_permissions(role_id);

-- ============================================================
-- 用户-角色关联表
-- ============================================================
CREATE TABLE IF NOT EXISTS user_roles (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    project_id      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_user_role_project UNIQUE (user_id, role_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);

-- ============================================================
-- 权限分组表
-- ============================================================
CREATE TABLE IF NOT EXISTS permission_groups (
    id              BIGSERIAL PRIMARY KEY,
    code            VARCHAR(64) NOT NULL UNIQUE,
    name            VARCHAR(128) NOT NULL,
    description     VARCHAR(512),
    permissions     JSONB NOT NULL DEFAULT '[]',
    sort_order      INT NOT NULL DEFAULT 0
);

-- ============================================================
-- 权限审计日志表
-- ============================================================
CREATE TABLE IF NOT EXISTS permission_audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    operator_id     BIGINT NOT NULL,
    target_type     VARCHAR(16) NOT NULL,
    target_id       BIGINT NOT NULL,
    action          VARCHAR(32) NOT NULL,
    before_value    JSONB,
    after_value     JSONB,
    ip_address      VARCHAR(45),
    user_agent      VARCHAR(512),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_perm_audit_tenant ON permission_audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perm_audit_target ON permission_audit_logs(target_type, target_id);

-- ============================================================
-- 预置权限分组 (Seed Data)
-- ============================================================
INSERT INTO permission_groups (code, name, permissions, sort_order) VALUES
('DEVICE',   '设备管理', '["device:create","device:read","device:update","device:delete","device:control","device:debug","device:import","device:export"]', 1),
('PRODUCT',  '产品管理', '["product:create","product:read","product:update","product:delete","product:publish"]', 2),
('RULE',     '规则引擎', '["rule:create","rule:read","rule:update","rule:delete","rule:enable","rule:debug"]', 3),
('ALERT',    '告警中心', '["alert:read","alert:config","alert:acknowledge"]', 4),
('OTA',      'OTA升级',  '["ota:read","ota:upload","ota:deploy","ota:rollback"]', 5),
('VIDEO',    '视频监控', '["video:live","video:playback","video:ptz","video:record","video:snapshot"]', 6),
('USER',     '用户权限', '["user:create","user:read","user:update","user:delete","user:role:assign","role:create","role:read","role:update","role:delete","apikey:create","apikey:read","apikey:delete"]', 7),
('TENANT',   '租户管理', '["tenant:read","tenant:manage","tenant:quota","tenant:billing"]', 8),
('SHARE',    '跨租户共享', '["share:create","share:read","share:approve","share:revoke"]', 9),
('ANALYTICS','数据分析', '["analytics:read","analytics:export"]', 10),
('AUDIT',    '审计日志', '["audit:read","audit:export"]', 11),
('SYSTEM',   '系统设置', '["system:config","system:notification"]', 12);
