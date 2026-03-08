-- =============================================================
-- V4: 异步任务中心表（统一任务模型）
-- =============================================================

CREATE TABLE IF NOT EXISTS async_tasks (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    task_name       VARCHAR(200) NOT NULL,
    task_type       VARCHAR(50) NOT NULL DEFAULT 'EXPORT',
    biz_type        VARCHAR(50),
    file_format     VARCHAR(20),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    progress        INT DEFAULT 0,
    query_params    TEXT,
    result_url      VARCHAR(500),
    result_size     BIGINT,
    total_rows      INT,
    error_message   TEXT,
    created_by      BIGINT,
    completed_at    TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_async_tasks_tenant ON async_tasks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_async_tasks_status ON async_tasks (status);
CREATE INDEX IF NOT EXISTS idx_async_tasks_type ON async_tasks (task_type);
CREATE INDEX IF NOT EXISTS idx_async_tasks_created ON async_tasks (created_at);
CREATE INDEX IF NOT EXISTS idx_async_tasks_created_by ON async_tasks (created_by);

COMMENT ON TABLE async_tasks IS '异步任务表';
COMMENT ON COLUMN async_tasks.task_type IS '任务类型: EXPORT/IMPORT/SYNC/BATCH/OTHER';
COMMENT ON COLUMN async_tasks.biz_type IS '业务类型: DEVICE/ALARM/AUDIT_LOG/DEVICE_DATA/LOCATION etc';
COMMENT ON COLUMN async_tasks.file_format IS '文件格式: CSV/EXCEL/JSON (导入导出时有效)';
COMMENT ON COLUMN async_tasks.status IS '任务状态: PENDING/PROCESSING/COMPLETED/FAILED/CANCELLED';
COMMENT ON COLUMN async_tasks.progress IS '任务进度 0-100';
COMMENT ON COLUMN async_tasks.result_url IS '结果文件路径（导出时为文件下载地址）';
COMMENT ON COLUMN async_tasks.result_size IS '结果文件大小（字节）';

-- 同步序列
SELECT setval('async_tasks_id_seq', COALESCE((SELECT MAX(id) FROM async_tasks), 0) + 1, false);
