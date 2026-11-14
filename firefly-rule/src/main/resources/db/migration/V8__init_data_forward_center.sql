-- ============================================================
-- 数据流转中心：数据流转规则 + 事件订阅
-- ============================================================

CREATE TABLE IF NOT EXISTS data_forward_rules (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL,
    project_id          BIGINT,
    name                VARCHAR(256) NOT NULL,
    description         TEXT,
    source_pattern      VARCHAR(256) NOT NULL,
    match_condition     TEXT,
    target_type         VARCHAR(32) NOT NULL,
    target_config       JSONB NOT NULL DEFAULT '{}',
    status              VARCHAR(16) NOT NULL DEFAULT 'DISABLED',
    trigger_count       BIGINT NOT NULL DEFAULT 0,
    success_count       BIGINT NOT NULL DEFAULT 0,
    error_count         BIGINT NOT NULL DEFAULT 0,
    last_trigger_at     TIMESTAMPTZ,
    created_by          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_forward_rules_tenant ON data_forward_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_data_forward_rules_status ON data_forward_rules(tenant_id, status);

CREATE TABLE IF NOT EXISTS event_subscriptions (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL,
    name                VARCHAR(256) NOT NULL,
    event_types         JSONB NOT NULL DEFAULT '[]',
    webhook_url         VARCHAR(512) NOT NULL,
    secret              VARCHAR(256),
    headers             JSONB,
    status              VARCHAR(16) NOT NULL DEFAULT 'DISABLED',
    delivery_count      BIGINT NOT NULL DEFAULT 0,
    success_count       BIGINT NOT NULL DEFAULT 0,
    error_count         BIGINT NOT NULL DEFAULT 0,
    last_delivered_at   TIMESTAMPTZ,
    created_by          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_subscriptions_tenant ON event_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_event_subscriptions_status ON event_subscriptions(tenant_id, status);
