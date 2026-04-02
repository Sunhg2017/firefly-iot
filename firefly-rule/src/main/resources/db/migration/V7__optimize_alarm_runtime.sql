-- Strengthen alarm runtime lookups for rule matching and open-record deduplication.

CREATE INDEX IF NOT EXISTS idx_alarm_rules_runtime_scope
    ON alarm_rules (tenant_id, enabled, product_id, device_id, project_id);

CREATE INDEX IF NOT EXISTS idx_alarm_records_runtime_open
    ON alarm_records (tenant_id, alarm_rule_id, device_id, status, created_at DESC);
