-- =============================================================
-- V20: 设备固件关联表
-- =============================================================

CREATE TABLE IF NOT EXISTS device_firmwares (
    id                  BIGSERIAL PRIMARY KEY,
    device_id           BIGINT NOT NULL,
    firmware_id         BIGINT,
    current_version     VARCHAR(100),
    target_version      VARCHAR(100),
    upgrade_status      VARCHAR(30) NOT NULL DEFAULT 'IDLE',
    upgrade_progress    INT NOT NULL DEFAULT 0,
    last_upgrade_at     TIMESTAMP,
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    updated_at          TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_firmwares_firmware ON device_firmwares (firmware_id);
CREATE INDEX IF NOT EXISTS idx_device_firmwares_version ON device_firmwares (current_version);
CREATE INDEX IF NOT EXISTS idx_device_firmwares_status ON device_firmwares (upgrade_status);

COMMENT ON TABLE device_firmwares IS '设备固件关联表';
COMMENT ON COLUMN device_firmwares.upgrade_status IS '升级状态: IDLE/DOWNLOADING/UPGRADING/SUCCESS/FAILED';
