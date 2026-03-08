-- ============================================================
-- 规则表
-- ============================================================
CREATE TABLE IF NOT EXISTS rules (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL,
    project_id          BIGINT,
    name                VARCHAR(256) NOT NULL,
    description         TEXT,
    sql_expr            TEXT NOT NULL,
    status              VARCHAR(16) NOT NULL DEFAULT 'DISABLED',
    trigger_count       BIGINT NOT NULL DEFAULT 0,
    success_count       BIGINT NOT NULL DEFAULT 0,
    error_count         BIGINT NOT NULL DEFAULT 0,
    last_trigger_at     TIMESTAMPTZ,
    created_by          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rules_tenant ON rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rules_project ON rules(project_id);
CREATE INDEX IF NOT EXISTS idx_rules_status ON rules(tenant_id, status);

-- ============================================================
-- 规则动作表
-- ============================================================
CREATE TABLE IF NOT EXISTS rule_actions (
    id              BIGSERIAL PRIMARY KEY,
    rule_id         BIGINT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    action_type     VARCHAR(32) NOT NULL,
    action_config   JSONB NOT NULL DEFAULT '{}',
    sort_order      INT NOT NULL DEFAULT 0,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rule_actions_rule ON rule_actions(rule_id);
