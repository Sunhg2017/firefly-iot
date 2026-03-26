-- 视频设备业务唯一性：
-- 1. GB28181 设备按 tenant_id + stream_mode + gb_device_id 唯一
-- 2. RTSP/RTMP 设备按 tenant_id + stream_mode + ip + port 唯一
CREATE UNIQUE INDEX IF NOT EXISTS uk_video_devices_tenant_mode_gb_device
    ON video_devices (tenant_id, stream_mode, gb_device_id)
    WHERE gb_device_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uk_video_devices_tenant_mode_endpoint
    ON video_devices (tenant_id, stream_mode, ip, COALESCE(port, -1))
    WHERE stream_mode IN ('RTSP', 'RTMP') AND ip IS NOT NULL;
