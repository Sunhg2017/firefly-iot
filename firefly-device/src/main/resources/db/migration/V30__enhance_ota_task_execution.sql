-- ============================================================
-- OTA 任务执行增强：固件对象键/摘要/签名 + 逐设备下发消息号
-- ============================================================

ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS file_key VARCHAR(512);
ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS sha256_checksum VARCHAR(64);
ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS signature TEXT;

COMMENT ON COLUMN firmwares.file_key IS 'MinIO 对象键，用于服务端校验固件内容';
COMMENT ON COLUMN firmwares.sha256_checksum IS '固件 SHA-256 摘要（十六进制）';
COMMENT ON COLUMN firmwares.signature IS '固件摘要的 RSA-SHA256 签名（Base64）';

ALTER TABLE ota_task_devices ADD COLUMN IF NOT EXISTS message_id VARCHAR(64);

COMMENT ON COLUMN ota_task_devices.message_id IS '升级指令下行消息号，用于进度回执关联';

CREATE INDEX IF NOT EXISTS idx_ota_task_devices_message ON ota_task_devices(message_id);
