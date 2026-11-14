-- ============================================================
-- 修正遥测去重唯一键：加入租户与设备身份
-- 原键 (message_id, property, ts) 未包含 tenant_id/device_id，
-- 不同设备使用相同局部消息 ID 时会相互冲突并被 DO NOTHING 静默丢弃。
-- ============================================================

DROP INDEX IF EXISTS uk_telemetry_message;

CREATE UNIQUE INDEX IF NOT EXISTS uk_telemetry_message
    ON device_telemetry (tenant_id, device_id, message_id, property, ts);

COMMENT ON INDEX uk_telemetry_message IS '同一租户同一设备同一消息的同一属性在同一时刻只保留一条，兼容不同设备的局部消息 ID';
