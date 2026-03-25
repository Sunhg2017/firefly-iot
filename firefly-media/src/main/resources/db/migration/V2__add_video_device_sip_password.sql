ALTER TABLE video_devices
    ADD COLUMN IF NOT EXISTS sip_password VARCHAR(128);
