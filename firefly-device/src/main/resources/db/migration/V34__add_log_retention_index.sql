-- ============================================================
-- 日志保留清理索引：按 created_at 分批删除需要时间列索引
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_device_logs_created_at ON device_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_device_events_created_at ON device_events (created_at);
