-- ============================================================
-- 告警规则表
-- ============================================================
CREATE TABLE IF NOT EXISTS alarm_rules (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL,
    project_id          BIGINT,
    name                VARCHAR(256) NOT NULL,
    description         TEXT,
    product_id          BIGINT,
    device_id           BIGINT,
    level               VARCHAR(16) NOT NULL DEFAULT 'WARNING',
    condition_expr      TEXT NOT NULL,
    enabled             BOOLEAN NOT NULL DEFAULT TRUE,
    notify_config       JSONB DEFAULT '{}',
    created_by          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alarm_rules_tenant ON alarm_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_alarm_rules_project ON alarm_rules(project_id);
CREATE INDEX IF NOT EXISTS idx_alarm_rules_product ON alarm_rules(product_id);
CREATE INDEX IF NOT EXISTS idx_alarm_rules_level ON alarm_rules(tenant_id, level);

-- ============================================================
-- 告警记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS alarm_records (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL,
    alarm_rule_id       BIGINT REFERENCES alarm_rules(id),
    product_id          BIGINT,
    device_id           BIGINT,
    project_id          BIGINT,
    level               VARCHAR(16) NOT NULL,
    status              VARCHAR(16) NOT NULL DEFAULT 'TRIGGERED',
    title               VARCHAR(512) NOT NULL,
    content             TEXT,
    trigger_value       TEXT,
    confirmed_by        BIGINT,
    confirmed_at        TIMESTAMPTZ,
    processed_by        BIGINT,
    processed_at        TIMESTAMPTZ,
    process_remark      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alarm_records_tenant ON alarm_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_alarm_records_rule ON alarm_records(alarm_rule_id);
CREATE INDEX IF NOT EXISTS idx_alarm_records_device ON alarm_records(device_id);
CREATE INDEX IF NOT EXISTS idx_alarm_records_status ON alarm_records(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_alarm_records_level ON alarm_records(tenant_id, level);
CREATE INDEX IF NOT EXISTS idx_alarm_records_created ON alarm_records(tenant_id, created_at DESC);
