-- ============================================================
-- V11: Auth tables (merged from firefly-auth)
-- ============================================================

-- 用户会话表
CREATE TABLE IF NOT EXISTS user_sessions (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT NOT NULL,
    tenant_id           BIGINT NOT NULL,
    platform            VARCHAR(32) NOT NULL,
    device_fingerprint  VARCHAR(256),
    device_name         VARCHAR(128),
    device_model        VARCHAR(128),
    os_version          VARCHAR(64),
    app_version         VARCHAR(32),
    login_method        VARCHAR(32) NOT NULL,
    login_ip            VARCHAR(45),
    login_location      VARCHAR(256),
    user_agent          VARCHAR(512),
    access_token_hash   VARCHAR(256) NOT NULL,
    refresh_token_hash  VARCHAR(256) NOT NULL,
    push_token          VARCHAR(512),
    push_channel        VARCHAR(32),
    access_expires_at   TIMESTAMPTZ NOT NULL,
    refresh_expires_at  TIMESTAMPTZ NOT NULL,
    last_active_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    status              VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_session_user ON user_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_session_tenant ON user_sessions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_session_access ON user_sessions(access_token_hash) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_session_refresh ON user_sessions(refresh_token_hash) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_session_platform ON user_sessions(user_id, platform, status);

-- 第三方 OAuth 绑定表
CREATE TABLE IF NOT EXISTS user_oauth_bindings (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    tenant_id       BIGINT NOT NULL,
    provider        VARCHAR(32) NOT NULL,
    open_id         VARCHAR(256) NOT NULL,
    union_id        VARCHAR(256),
    app_id          VARCHAR(128) NOT NULL,
    nickname        VARCHAR(256),
    avatar_url      VARCHAR(512),
    raw_data        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_oauth_provider_openid UNIQUE (provider, open_id, app_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_user ON user_oauth_bindings(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_union ON user_oauth_bindings(provider, union_id);

-- Token 黑名单表
CREATE TABLE IF NOT EXISTS token_blacklist (
    token_hash      VARCHAR(256) PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    type            VARCHAR(16) NOT NULL,
    reason          VARCHAR(32) NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blacklist_expires ON token_blacklist(expires_at);

-- 登录日志表
CREATE TABLE IF NOT EXISTS login_logs (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT,
    tenant_id           BIGINT,
    username            VARCHAR(128),
    platform            VARCHAR(32),
    login_method        VARCHAR(32),
    login_ip            VARCHAR(45),
    login_location      VARCHAR(256),
    user_agent          VARCHAR(512),
    device_fingerprint  VARCHAR(256),
    result              VARCHAR(32) NOT NULL,
    fail_reason         VARCHAR(512),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_log_user ON login_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_log_tenant ON login_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_log_ip ON login_logs(login_ip, created_at DESC);

-- 短信验证码表
CREATE TABLE IF NOT EXISTS sms_verify_codes (
    id              BIGSERIAL PRIMARY KEY,
    phone           VARCHAR(32) NOT NULL,
    code            VARCHAR(8) NOT NULL,
    purpose         VARCHAR(32) NOT NULL,
    ip_address      VARCHAR(45),
    verified        BOOLEAN NOT NULL DEFAULT FALSE,
    verify_count    INT NOT NULL DEFAULT 0,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_phone ON sms_verify_codes(phone, purpose, created_at DESC);

-- 扫码登录票据表
CREATE TABLE IF NOT EXISTS qrcode_login_tickets (
    id                  VARCHAR(64) PRIMARY KEY,
    status              VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    scanned_user_id     BIGINT,
    scanned_platform    VARCHAR(32),
    confirm_token       VARCHAR(256),
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
