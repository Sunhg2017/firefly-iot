-- ============================================================
-- 设备认证补全 + 远程配置
--   device_certificate              设备 X.509 证书
--   device_remote_config            远程配置模板
--   device_remote_config_version    配置版本（不可变）
--   device_remote_config_assignment 下发记录
-- ============================================================

CREATE TABLE IF NOT EXISTS device_certificate (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL,
    device_id           BIGINT NOT NULL,
    serial_number       VARCHAR(128),
    subject_dn          VARCHAR(512),
    fingerprint_sha256  VARCHAR(128) NOT NULL,
    certificate_pem     TEXT NOT NULL,
    status              VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    valid_from          TIMESTAMPTZ,
    valid_to            TIMESTAMPTZ,
    created_by          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_device_certificate_fingerprint
    ON device_certificate (fingerprint_sha256);
CREATE INDEX IF NOT EXISTS idx_device_certificate_device
    ON device_certificate (tenant_id, device_id);

CREATE TABLE IF NOT EXISTS device_remote_config (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    project_id      BIGINT,
    name            VARCHAR(256) NOT NULL,
    description     TEXT,
    target_type     VARCHAR(16) NOT NULL,
    target_id       BIGINT,
    config_json     JSONB NOT NULL DEFAULT '{}',
    version         INT NOT NULL DEFAULT 0,
    status          VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remote_config_tenant
    ON device_remote_config (tenant_id, status);

CREATE TABLE IF NOT EXISTS device_remote_config_version (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    config_id       BIGINT NOT NULL REFERENCES device_remote_config(id) ON DELETE CASCADE,
    version         INT NOT NULL,
    config_json     JSONB NOT NULL DEFAULT '{}',
    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_remote_config_version
    ON device_remote_config_version (config_id, version);
CREATE INDEX IF NOT EXISTS idx_remote_config_version_config
    ON device_remote_config_version (tenant_id, config_id);

CREATE TABLE IF NOT EXISTS device_remote_config_assignment (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    config_id       BIGINT NOT NULL REFERENCES device_remote_config(id) ON DELETE CASCADE,
    config_version  INT NOT NULL,
    device_id       BIGINT NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    message_id      VARCHAR(64),
    error_message   VARCHAR(512),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_remote_config_assignment
    ON device_remote_config_assignment (config_id, config_version, device_id);
CREATE INDEX IF NOT EXISTS idx_remote_config_assignment_config
    ON device_remote_config_assignment (tenant_id, config_id, status);
CREATE INDEX IF NOT EXISTS idx_remote_config_assignment_device
    ON device_remote_config_assignment (tenant_id, device_id, updated_at DESC);
