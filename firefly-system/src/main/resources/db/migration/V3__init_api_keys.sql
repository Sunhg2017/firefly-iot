-- API Key 表
CREATE TABLE IF NOT EXISTS api_keys (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    access_key      VARCHAR(64) NOT NULL UNIQUE,
    secret_key_hash TEXT NOT NULL,
    scopes          JSONB NOT NULL DEFAULT '["*"]',
    rate_limit_per_min INT NOT NULL DEFAULT 600,
    rate_limit_per_day INT NOT NULL DEFAULT 100000,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    expire_at       TIMESTAMP,
    last_used_at    TIMESTAMP,
    created_by      BIGINT NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_access_key ON api_keys(access_key) WHERE deleted_at IS NULL;

-- API 调用日志表
CREATE TABLE IF NOT EXISTS api_access_logs (
    id              BIGSERIAL PRIMARY KEY,
    api_key_id      BIGINT NOT NULL,
    tenant_id       BIGINT NOT NULL,
    method          VARCHAR(10) NOT NULL,
    path            VARCHAR(512) NOT NULL,
    status_code     INT NOT NULL,
    latency_ms      INT NOT NULL,
    client_ip       VARCHAR(64),
    request_size    INT,
    response_size   INT,
    error_message   TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_access_logs_key ON api_access_logs(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_tenant ON api_access_logs(tenant_id, created_at DESC);

-- API 调用统计日报表
CREATE TABLE IF NOT EXISTS api_call_stats_daily (
    id              BIGSERIAL PRIMARY KEY,
    api_key_id      BIGINT NOT NULL,
    tenant_id       BIGINT NOT NULL,
    stat_date       DATE NOT NULL,
    total_calls     BIGINT NOT NULL DEFAULT 0,
    success_calls   BIGINT NOT NULL DEFAULT 0,
    error_calls     BIGINT NOT NULL DEFAULT 0,
    avg_latency_ms  INT NOT NULL DEFAULT 0,
    max_latency_ms  INT NOT NULL DEFAULT 0,
    p99_latency_ms  INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(api_key_id, stat_date)
);
