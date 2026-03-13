-- =============================================================
-- V6: scheduled task tables
-- =============================================================

CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id                BIGSERIAL PRIMARY KEY,
    task_name         VARCHAR(200) NOT NULL,
    task_group        VARCHAR(100) NOT NULL DEFAULT 'DEFAULT',
    cron_expression   VARCHAR(100) NOT NULL,
    bean_name         VARCHAR(200) NOT NULL,
    method_name       VARCHAR(200) NOT NULL,
    method_params     VARCHAR(500),
    status            SMALLINT NOT NULL DEFAULT 1,
    description       VARCHAR(500),
    misfire_policy    SMALLINT NOT NULL DEFAULT 0,
    last_exec_time    TIMESTAMP,
    last_exec_status  VARCHAR(20),
    last_exec_message TEXT,
    created_by        BIGINT,
    created_at        TIMESTAMP NOT NULL DEFAULT now(),
    updated_at        TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sched_tasks_status ON scheduled_tasks (status);
CREATE INDEX IF NOT EXISTS idx_sched_tasks_group ON scheduled_tasks (task_group);

COMMENT ON TABLE scheduled_tasks IS 'Scheduled task definitions';
COMMENT ON COLUMN scheduled_tasks.task_name IS 'Task display name';
COMMENT ON COLUMN scheduled_tasks.task_group IS 'Task group';
COMMENT ON COLUMN scheduled_tasks.cron_expression IS 'Cron expression';
COMMENT ON COLUMN scheduled_tasks.bean_name IS 'Spring bean name';
COMMENT ON COLUMN scheduled_tasks.method_name IS 'Invoked method name';
COMMENT ON COLUMN scheduled_tasks.method_params IS 'Method parameters in JSON text';
COMMENT ON COLUMN scheduled_tasks.status IS '0=disabled, 1=enabled';
COMMENT ON COLUMN scheduled_tasks.misfire_policy IS '0=ignore, 1=fire once immediately';
COMMENT ON COLUMN scheduled_tasks.last_exec_time IS 'Last execution time';
COMMENT ON COLUMN scheduled_tasks.last_exec_status IS 'Last execution status';
COMMENT ON COLUMN scheduled_tasks.last_exec_message IS 'Last execution message';

CREATE TABLE IF NOT EXISTS scheduled_task_logs (
    id            BIGSERIAL PRIMARY KEY,
    task_id       BIGINT NOT NULL,
    task_name     VARCHAR(200),
    task_group    VARCHAR(100),
    bean_name     VARCHAR(200),
    method_name   VARCHAR(200),
    method_params VARCHAR(500),
    status        VARCHAR(20) NOT NULL,
    start_time    TIMESTAMP NOT NULL,
    end_time      TIMESTAMP,
    duration_ms   BIGINT,
    error_message TEXT,
    created_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sched_logs_task ON scheduled_task_logs (task_id);
CREATE INDEX IF NOT EXISTS idx_sched_logs_status ON scheduled_task_logs (status);
CREATE INDEX IF NOT EXISTS idx_sched_logs_start ON scheduled_task_logs (start_time);

COMMENT ON TABLE scheduled_task_logs IS 'Scheduled task execution logs';
COMMENT ON COLUMN scheduled_task_logs.status IS 'Execution result status';
COMMENT ON COLUMN scheduled_task_logs.error_message IS 'Failure details when execution fails';
