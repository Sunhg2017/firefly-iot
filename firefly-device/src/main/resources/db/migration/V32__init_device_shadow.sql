-- ============================================================
-- 设备影子 desired 权威副本：Redis 作为缓存，DB 作为 desired 的持久权威
-- reported 仍只存 Redis（设备实时状态，允许丢失后由设备重新上报）
-- ============================================================

CREATE TABLE IF NOT EXISTS device_shadow (
    device_id   BIGINT PRIMARY KEY,
    tenant_id   BIGINT NOT NULL,
    desired     JSONB NOT NULL DEFAULT '{}'::jsonb,
    version     BIGINT NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_shadow_tenant ON device_shadow (tenant_id);

COMMENT ON TABLE device_shadow IS '设备影子 desired 权威副本，防止 Redis 淘汰或重启后期望状态丢失';
COMMENT ON COLUMN device_shadow.desired IS '平台下发的期望属性，JSON 对象';
COMMENT ON COLUMN device_shadow.version IS 'desired 变更版本号，单调递增';
