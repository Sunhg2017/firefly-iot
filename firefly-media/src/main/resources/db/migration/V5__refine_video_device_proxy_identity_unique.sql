-- RTSP/RTMP 代理设备优先按完整 source_url 做业务唯一性，
-- 仅对尚未落 source_url 的历史/非路径化记录继续保留 endpoint 唯一约束。
DROP INDEX IF EXISTS uk_video_devices_tenant_mode_endpoint;

CREATE UNIQUE INDEX IF NOT EXISTS uk_video_devices_tenant_mode_source_url
    ON video_devices (tenant_id, stream_mode, source_url)
    WHERE stream_mode IN ('RTSP', 'RTMP') AND source_url IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uk_video_devices_tenant_mode_endpoint_legacy
    ON video_devices (tenant_id, stream_mode, ip, COALESCE(port, -1))
    WHERE stream_mode IN ('RTSP', 'RTMP') AND source_url IS NULL AND ip IS NOT NULL;
