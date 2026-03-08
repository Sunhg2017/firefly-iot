-- ============================================================
-- 固件表
-- ============================================================
CREATE TABLE IF NOT EXISTS firmwares (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    product_id      BIGINT NOT NULL REFERENCES products(id),
    version         VARCHAR(64) NOT NULL,
    display_name    VARCHAR(256),
    description     TEXT,
    file_url        VARCHAR(1024) NOT NULL,
    file_size       BIGINT NOT NULL DEFAULT 0,
    md5_checksum    VARCHAR(64),
    status          VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_firmware_product_version UNIQUE (product_id, version)
);

CREATE INDEX IF NOT EXISTS idx_firmwares_tenant ON firmwares(tenant_id);
CREATE INDEX IF NOT EXISTS idx_firmwares_product ON firmwares(product_id);
CREATE INDEX IF NOT EXISTS idx_firmwares_status ON firmwares(tenant_id, status);

-- ============================================================
-- OTA 升级任务表
-- ============================================================
CREATE TABLE IF NOT EXISTS ota_tasks (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    product_id      BIGINT NOT NULL REFERENCES products(id),
    firmware_id     BIGINT NOT NULL REFERENCES firmwares(id),
    name            VARCHAR(256) NOT NULL,
    description     TEXT,
    task_type       VARCHAR(16) NOT NULL DEFAULT 'FULL',
    src_version     VARCHAR(64),
    dest_version    VARCHAR(64) NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    total_count     INT NOT NULL DEFAULT 0,
    success_count   INT NOT NULL DEFAULT 0,
    failure_count   INT NOT NULL DEFAULT 0,
    gray_ratio      INT,
    created_by      BIGINT,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ota_tasks_tenant ON ota_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ota_tasks_product ON ota_tasks(product_id);
CREATE INDEX IF NOT EXISTS idx_ota_tasks_status ON ota_tasks(tenant_id, status);

-- ============================================================
-- OTA 任务设备表
-- ============================================================
CREATE TABLE IF NOT EXISTS ota_task_devices (
    id              BIGSERIAL PRIMARY KEY,
    task_id         BIGINT NOT NULL REFERENCES ota_tasks(id) ON DELETE CASCADE,
    device_id       BIGINT NOT NULL REFERENCES devices(id),
    status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    progress        INT NOT NULL DEFAULT 0,
    error_message   TEXT,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ota_task_devices_task ON ota_task_devices(task_id);
CREATE INDEX IF NOT EXISTS idx_ota_task_devices_device ON ota_task_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_ota_task_devices_status ON ota_task_devices(task_id, status);
