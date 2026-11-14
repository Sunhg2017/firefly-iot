-- ============================================================
-- 审计日志保留清理索引：按 created_at 分批删除
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at);
