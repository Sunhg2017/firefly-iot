-- ============================================================
-- 视频录像元数据表
--
-- 由 ZLMediaKit on_record_mp4 webhook 在录制完成后写入，
-- 用于「录像检索 / 历史回放 / 录像下载」。录像文件本体仍存于
-- ZLMediaKit 的 record.filePath 目录，本表只记录元数据与文件路径。
-- ============================================================
CREATE TABLE IF NOT EXISTS video_recordings (
    id                BIGSERIAL PRIMARY KEY,
    tenant_id         BIGINT NOT NULL,
    device_id         BIGINT NOT NULL,
    channel_id        VARCHAR(64),
    app               VARCHAR(64),
    stream            VARCHAR(256),
    file_name         VARCHAR(256),
    file_path         VARCHAR(1024) NOT NULL,
    file_size         BIGINT,
    start_time        BIGINT,
    duration_seconds  DOUBLE PRECISION,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 同一 ZLM 录制文件只保留一条元数据（webhook 可能因重试重复投递）
CREATE UNIQUE INDEX IF NOT EXISTS uk_video_recordings_file_path
    ON video_recordings(file_path);

CREATE INDEX IF NOT EXISTS idx_video_recordings_device_time
    ON video_recordings(tenant_id, device_id, start_time DESC);
