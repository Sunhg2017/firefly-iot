-- =============================================================
-- V12: 审计日志表
-- =============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    user_id         BIGINT,
    username        VARCHAR(100),
    module          VARCHAR(50) NOT NULL,
    action          VARCHAR(50) NOT NULL,
    description     VARCHAR(500),
    target_type     VARCHAR(50),
    target_id       VARCHAR(100),
    request_method  VARCHAR(10),
    request_url     VARCHAR(500),
    request_params  VARCHAR(2000),
    request_body    TEXT,
    response_status VARCHAR(20),
    client_ip       VARCHAR(50),
    user_agent      VARCHAR(500),
    duration        BIGINT,
    error_message   VARCHAR(500),
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs (tenant_id, module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (tenant_id, action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (tenant_id, created_at DESC);

COMMENT ON TABLE audit_logs IS '审计日志表';
COMMENT ON COLUMN audit_logs.module IS '操作模块: TENANT/USER/ROLE/PRODUCT/DEVICE/...';
COMMENT ON COLUMN audit_logs.action IS '操作类型: CREATE/UPDATE/DELETE/QUERY/...';
COMMENT ON COLUMN audit_logs.target_type IS '操作对象类型';
COMMENT ON COLUMN audit_logs.target_id IS '操作对象ID';
COMMENT ON COLUMN audit_logs.duration IS '耗时(ms)';
COMMENT ON COLUMN audit_logs.response_status IS '响应状态: SUCCESS/FAILED';
