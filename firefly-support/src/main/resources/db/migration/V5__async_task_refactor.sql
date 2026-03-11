-- =============================================================
-- V5: 异步任务中心重构 —— 字段重命名
-- =============================================================

-- 将 query_params 重命名为 extra_data
ALTER TABLE async_tasks RENAME COLUMN query_params TO extra_data;

COMMENT ON COLUMN async_tasks.extra_data IS '附加业务数据（JSON 字符串），例如 fileKey、productId 等';
