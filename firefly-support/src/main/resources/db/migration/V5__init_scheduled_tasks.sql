-- =============================================================
-- V5: 定时任务管理表
-- =============================================================

CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id              BIGSERIAL PRIMARY KEY,
    task_name       VARCHAR(200) NOT NULL,
    task_group      VARCHAR(100) NOT NULL DEFAULT 'DEFAULT',
    cron_expression VARCHAR(100) NOT NULL,
    bean_name       VARCHAR(200) NOT NULL,
    method_name     VARCHAR(200) NOT NULL,
    method_params   VARCHAR(500),
    status          SMALLINT NOT NULL DEFAULT 1,
    description     VARCHAR(500),
    misfire_policy  SMALLINT NOT NULL DEFAULT 0,
    last_exec_time  TIMESTAMP,
    last_exec_status VARCHAR(20),
    last_exec_message TEXT,
    created_by      BIGINT,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sched_tasks_status ON scheduled_tasks (status);
CREATE INDEX IF NOT EXISTS idx_sched_tasks_group ON scheduled_tasks (task_group);

COMMENT ON TABLE scheduled_tasks IS '定时任务配置表';
COMMENT ON COLUMN scheduled_tasks.task_name IS '任务名称';
COMMENT ON COLUMN scheduled_tasks.task_group IS '任务分组';
COMMENT ON COLUMN scheduled_tasks.cron_expression IS 'Cron 表达式';
COMMENT ON COLUMN scheduled_tasks.bean_name IS 'Spring Bean 名称';
COMMENT ON COLUMN scheduled_tasks.method_name IS '执行方法名';
COMMENT ON COLUMN scheduled_tasks.method_params IS '方法参数 (JSON)';
COMMENT ON COLUMN scheduled_tasks.status IS '状态: 0=暂停, 1=启用';
COMMENT ON COLUMN scheduled_tasks.misfire_policy IS '过期策略: 0=忽略, 1=立即执行一次';
COMMENT ON COLUMN scheduled_tasks.last_exec_time IS '上次执行时间';
COMMENT ON COLUMN scheduled_tasks.last_exec_status IS '上次执行状态: SUCCESS/FAILED';
COMMENT ON COLUMN scheduled_tasks.last_exec_message IS '上次执行消息(失败时为异常信息)';

-- 定时任务执行日志表
CREATE TABLE IF NOT EXISTS scheduled_task_logs (
    id              BIGSERIAL PRIMARY KEY,
    task_id         BIGINT NOT NULL,
    task_name       VARCHAR(200),
    task_group      VARCHAR(100),
    bean_name       VARCHAR(200),
    method_name     VARCHAR(200),
    method_params   VARCHAR(500),
    status          VARCHAR(20) NOT NULL,
    start_time      TIMESTAMP NOT NULL,
    end_time        TIMESTAMP,
    duration_ms     BIGINT,
    error_message   TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sched_logs_task ON scheduled_task_logs (task_id);
CREATE INDEX IF NOT EXISTS idx_sched_logs_status ON scheduled_task_logs (status);
CREATE INDEX IF NOT EXISTS idx_sched_logs_start ON scheduled_task_logs (start_time);

COMMENT ON TABLE scheduled_task_logs IS '定时任务执行日志表';
