-- Remove unsupported legacy DB_WRITE actions so the rule engine only keeps
-- runtime-supported action types after this upgrade.
DELETE FROM rule_actions
WHERE action_type = 'DB_WRITE';

-- Enabled rules must keep at least one enabled action after the cleanup.
UPDATE rules
SET status = 'DISABLED',
    updated_at = now()
WHERE status = 'ENABLED'
  AND NOT EXISTS (
        SELECT 1
        FROM rule_actions ra
        WHERE ra.rule_id = rules.id
          AND ra.enabled = TRUE
    );
