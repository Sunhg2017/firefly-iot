-- =============================================================
-- V15: 跨租户共享（策略 + 订阅 + 审计日志）
-- =============================================================

CREATE TABLE IF NOT EXISTS share_policies (
    id                  BIGSERIAL PRIMARY KEY,
    owner_tenant_id     BIGINT NOT NULL,
    consumer_tenant_id  BIGINT NOT NULL,
    name                VARCHAR(200) NOT NULL,
    scope               TEXT,
    data_permissions    TEXT,
    masking_rules       TEXT,
    rate_limit          TEXT,
    validity            TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    audit_enabled       BOOLEAN NOT NULL DEFAULT true,
    created_by          BIGINT,
    approved_by         BIGINT,
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    updated_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_policies_owner ON share_policies (owner_tenant_id);
CREATE INDEX IF NOT EXISTS idx_share_policies_consumer ON share_policies (consumer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_share_policies_status ON share_policies (status);

COMMENT ON TABLE share_policies IS '跨租户共享策略表';
COMMENT ON COLUMN share_policies.scope IS '共享范围 JSON (产品/设备列表)';
COMMENT ON COLUMN share_policies.data_permissions IS '数据权限 JSON (属性/事件/遥测)';
COMMENT ON COLUMN share_policies.masking_rules IS '脱敏规则 JSON (字段→脱敏方式)';
COMMENT ON COLUMN share_policies.rate_limit IS '频率限制 JSON (qps/daily)';
COMMENT ON COLUMN share_policies.validity IS '有效期 JSON (startTime/endTime)';
COMMENT ON COLUMN share_policies.status IS 'PENDING/APPROVED/REJECTED/REVOKED/EXPIRED';

-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS share_subscriptions (
    id                  BIGSERIAL PRIMARY KEY,
    policy_id           BIGINT NOT NULL REFERENCES share_policies(id),
    consumer_tenant_id  BIGINT NOT NULL,
    kafka_topic         VARCHAR(200),
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_subscriptions_policy ON share_subscriptions (policy_id);
CREATE INDEX IF NOT EXISTS idx_share_subscriptions_consumer ON share_subscriptions (consumer_tenant_id);

COMMENT ON TABLE share_subscriptions IS '共享数据实时订阅表';

-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS share_audit_logs (
    id                  BIGSERIAL PRIMARY KEY,
    policy_id           BIGINT NOT NULL,
    consumer_tenant_id  BIGINT NOT NULL,
    action              VARCHAR(50) NOT NULL,
    query_detail        TEXT,
    result_count        INT,
    ip_address          VARCHAR(50),
    created_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_audit_logs_policy ON share_audit_logs (policy_id);
CREATE INDEX IF NOT EXISTS idx_share_audit_logs_consumer ON share_audit_logs (consumer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_share_audit_logs_created ON share_audit_logs (created_at DESC);

COMMENT ON TABLE share_audit_logs IS '共享审计日志表';
COMMENT ON COLUMN share_audit_logs.action IS '操作类型: QUERY_PROPERTIES/QUERY_TELEMETRY/SUBSCRIBE/POLICY_CHANGE';
