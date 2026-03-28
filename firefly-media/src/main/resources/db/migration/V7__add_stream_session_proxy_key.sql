ALTER TABLE stream_sessions
    ADD COLUMN IF NOT EXISTS proxy_key VARCHAR(512);
