-- ============================================================
-- 时序数据幂等：为遥测数据增加消息标识与唯一约束
-- 消费失败重试时按 (message_id, property, ts) 去重，避免重复写入。
-- ============================================================

ALTER TABLE device_telemetry
    ADD COLUMN IF NOT EXISTS message_id VARCHAR(64);

-- 超表要求唯一索引包含时间分区列 ts；普通表同样适用。
CREATE UNIQUE INDEX IF NOT EXISTS uk_telemetry_message
    ON device_telemetry (message_id, property, ts);

COMMENT ON COLUMN device_telemetry.message_id IS '设备消息标识，用于消费重试幂等去重，手工写入可为空';
