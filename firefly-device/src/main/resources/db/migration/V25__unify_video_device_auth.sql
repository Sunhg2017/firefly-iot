ALTER TABLE device_video_profiles
    ADD COLUMN IF NOT EXISTS auth_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS auth_username VARCHAR(128),
    ADD COLUMN IF NOT EXISTS auth_password VARCHAR(128);

UPDATE device_video_profiles
SET auth_enabled = TRUE,
    auth_username = gb_device_id,
    auth_password = sip_password
WHERE stream_mode = 'GB28181'
  AND sip_password IS NOT NULL;

ALTER TABLE device_video_profiles
    DROP COLUMN IF EXISTS sip_password;
