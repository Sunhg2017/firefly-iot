-- =============================================================
-- V26: 操作日志表
-- =============================================================

CREATE TABLE IF NOT EXISTS operation_logs (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT,
    user_id         BIGINT,
    username        VARCHAR(100),
    module          VARCHAR(100),
    operation_type  VARCHAR(50),
    description     VARCHAR(500),
    method          VARCHAR(300),
    request_url     VARCHAR(500),
    request_method  VARCHAR(10),
    request_params  TEXT,
    response_result TEXT,
    ip              VARCHAR(50),
    user_agent      VARCHAR(500),
    status          INT NOT NULL DEFAULT 0,
    error_msg       TEXT,
    cost_ms         BIGINT,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oper_logs_tenant ON operation_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_oper_logs_user ON operation_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_oper_logs_module ON operation_logs (module);
CREATE INDEX IF NOT EXISTS idx_oper_logs_type ON operation_logs (operation_type);
CREATE INDEX IF NOT EXISTS idx_oper_logs_status ON operation_logs (status);
CREATE INDEX IF NOT EXISTS idx_oper_logs_time ON operation_logs (created_at);

COMMENT ON TABLE operation_logs IS '操作日志表';
COMMENT ON COLUMN operation_logs.status IS '0=成功, 1=失败';
COMMENT ON COLUMN operation_logs.operation_type IS '操作类型: CREATE/UPDATE/DELETE/QUERY/EXPORT/LOGIN/LOGOUT';
COMMENT ON COLUMN operation_logs.cost_ms IS '操作耗时（毫秒）';
