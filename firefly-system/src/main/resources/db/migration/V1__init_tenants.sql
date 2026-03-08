-- ============================================================
-- 租户表
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
    id                  BIGSERIAL PRIMARY KEY,
    code                VARCHAR(64) NOT NULL UNIQUE,
    name                VARCHAR(256) NOT NULL,
    display_name        VARCHAR(256),
    description         TEXT,
    logo_url            VARCHAR(512),
    contact_name        VARCHAR(128),
    contact_phone       VARCHAR(32),
    contact_email       VARCHAR(256),
    plan                VARCHAR(32) NOT NULL DEFAULT 'FREE',
    status              VARCHAR(32) NOT NULL DEFAULT 'INITIALIZING',
    isolation_level     VARCHAR(32) NOT NULL DEFAULT 'SHARED_RLS',
    isolation_config    JSONB DEFAULT '{}',
    admin_user_id       BIGINT,
    expire_at           TIMESTAMPTZ,
    suspended_at        TIMESTAMPTZ,
    suspended_reason    VARCHAR(512),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants(plan);

-- ============================================================
-- 项目表
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
    code            VARCHAR(64) NOT NULL,
    name            VARCHAR(256) NOT NULL,
    description     TEXT,
    status          VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_project_tenant_code UNIQUE (tenant_id, code)
);

-- ============================================================
-- 租户配额表
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_quotas (
    id                      BIGSERIAL PRIMARY KEY,
    tenant_id               BIGINT NOT NULL UNIQUE REFERENCES tenants(id),
    max_devices             INT NOT NULL DEFAULT 100,
    max_msg_per_sec         INT NOT NULL DEFAULT 100,
    max_rules               INT NOT NULL DEFAULT 10,
    data_retention_days     INT NOT NULL DEFAULT 7,
    max_ota_storage_gb      INT NOT NULL DEFAULT 1,
    max_api_calls_day       INT NOT NULL DEFAULT 10000,
    max_users               INT NOT NULL DEFAULT 5,
    max_projects            INT NOT NULL DEFAULT 1,
    max_video_channels      INT NOT NULL DEFAULT 5,
    max_video_storage_gb    INT NOT NULL DEFAULT 10,
    max_share_policies      INT NOT NULL DEFAULT 0,
    custom_config           JSONB DEFAULT '{}',
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 租户实时用量表
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_usage_realtime (
    tenant_id               BIGINT PRIMARY KEY REFERENCES tenants(id),
    device_count            INT NOT NULL DEFAULT 0,
    device_online_count     INT NOT NULL DEFAULT 0,
    current_msg_rate        DOUBLE PRECISION NOT NULL DEFAULT 0,
    rule_count              INT NOT NULL DEFAULT 0,
    api_calls_today         BIGINT NOT NULL DEFAULT 0,
    ota_storage_bytes       BIGINT NOT NULL DEFAULT 0,
    video_channel_active    INT NOT NULL DEFAULT 0,
    video_storage_bytes     BIGINT NOT NULL DEFAULT 0,
    user_count              INT NOT NULL DEFAULT 0,
    project_count           INT NOT NULL DEFAULT 0,
    share_policy_count      INT NOT NULL DEFAULT 0,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 租户每日用量统计表
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_usage_daily (
    id                      BIGSERIAL PRIMARY KEY,
    tenant_id               BIGINT NOT NULL REFERENCES tenants(id),
    date                    DATE NOT NULL,
    device_count            INT NOT NULL DEFAULT 0,
    device_online_peak      INT NOT NULL DEFAULT 0,
    message_count           BIGINT NOT NULL DEFAULT 0,
    message_rate_peak       INT NOT NULL DEFAULT 0,
    rule_count              INT NOT NULL DEFAULT 0,
    api_call_count          BIGINT NOT NULL DEFAULT 0,
    storage_bytes           BIGINT NOT NULL DEFAULT 0,
    video_channel_count     INT NOT NULL DEFAULT 0,
    video_storage_bytes     BIGINT NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_tenant_usage_daily UNIQUE (tenant_id, date)
);
CREATE INDEX IF NOT EXISTS idx_usage_daily_tenant_date ON tenant_usage_daily(tenant_id, date DESC);

-- ============================================================
-- 租户审计日志
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    operator_id     BIGINT NOT NULL,
    action          VARCHAR(32) NOT NULL,
    detail          JSONB,
    ip_address      VARCHAR(45),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_tenant ON tenant_audit_logs(tenant_id, created_at DESC);
