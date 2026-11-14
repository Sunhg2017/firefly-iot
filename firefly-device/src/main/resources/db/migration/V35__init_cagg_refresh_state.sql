-- ============================================================
-- CAGG 缺口补刷水位：记录每个连续聚合已回填到的时间点
-- 系统停机超过 CAGG policy 的 start_offset 时，policy 不会回补缺口，
-- 由应用按水位到现在的区间调用 refresh_continuous_aggregate 补齐。
-- ============================================================

CREATE TABLE IF NOT EXISTS telemetry_cagg_refresh_state (
    cagg_name       VARCHAR(64) PRIMARY KEY,
    refreshed_until TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE telemetry_cagg_refresh_state IS '连续聚合缺口补刷水位：refreshed_until 之前的数据已完成回填';
