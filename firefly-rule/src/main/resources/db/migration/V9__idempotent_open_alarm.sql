-- ============================================================
-- 告警幂等：同一租户、同一规则、同一设备最多一条进行中告警
-- 进行中状态：TRIGGERED / CONFIRMED
-- ============================================================

-- 历史重复数据只保留最新一条进行中记录，其余关闭，避免唯一索引创建失败。
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY tenant_id, alarm_rule_id, device_id
               ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM alarm_records
    WHERE status IN ('TRIGGERED', 'CONFIRMED')
)
UPDATE alarm_records a
SET status = 'CLOSED',
    updated_at = now(),
    process_remark = COALESCE(a.process_remark, '') || ' [系统合并重复告警]'
FROM ranked r
WHERE a.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uk_alarm_open_record
    ON alarm_records (tenant_id, alarm_rule_id, device_id)
    WHERE status IN ('TRIGGERED', 'CONFIRMED');

COMMENT ON INDEX uk_alarm_open_record IS '同一规则同一设备最多一条进行中告警，防止并发/重放双开';
