-- ============================================================
-- 时序数据治理：按租户保留策略 + TimescaleDB 超表/压缩/保留/降采样
-- ============================================================

-- 1. 按租户保留策略表（未配置时使用全局默认保留天数）
CREATE TABLE IF NOT EXISTS tenant_telemetry_retention (
    tenant_id       BIGINT PRIMARY KEY,
    retention_days  INTEGER NOT NULL,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tenant_telemetry_retention IS '按租户配置的时序数据保留天数';
COMMENT ON COLUMN tenant_telemetry_retention.retention_days IS '保留天数，需小于等于全局上限';

-- 2. 条件化启用 TimescaleDB 治理能力
--    部署镜像自带 timescaledb 扩展；若宿主环境缺失该扩展，优雅跳过并保持普通表，不阻断启动。
DO $$
BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS timescaledb;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'timescaledb extension unavailable, telemetry governance skipped: %', SQLERRM;
    END;

    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        -- 2.1 转换为超表：按 1 天分块，已有数据一并迁移
        BEGIN
            PERFORM create_hypertable(
                'device_telemetry',
                'ts',
                chunk_time_interval => INTERVAL '1 day',
                migrate_data => true,
                if_not_exists => true
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'create_hypertable skipped: %', SQLERRM;
        END;

        -- 2.2 压缩策略：超过 7 天的数据块按租户+设备分段压缩
        BEGIN
            ALTER TABLE device_telemetry SET (
                timescaledb.compress,
                timescaledb.compress_segmentby = 'tenant_id, device_id',
                timescaledb.compress_orderby = 'ts DESC'
            );
            PERFORM add_compression_policy('device_telemetry', INTERVAL '7 days', if_not_exists => true);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'compression policy skipped: %', SQLERRM;
        END;

        -- 2.3 全局保留安全上限：超过 365 天整块丢弃（快速释放存储）
        BEGIN
            PERFORM add_retention_policy('device_telemetry', INTERVAL '365 days', if_not_exists => true);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'global retention policy skipped: %', SQLERRM;
        END;

        -- 2.4 小时级连续聚合（降采样 + 长期归档）
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM timescaledb_information.continuous_aggregates
                WHERE view_name = 'device_telemetry_hourly'
            ) THEN
                EXECUTE $sql$
                    CREATE MATERIALIZED VIEW device_telemetry_hourly
                    WITH (timescaledb.continuous) AS
                    SELECT time_bucket('1 hour', ts) AS bucket,
                           tenant_id,
                           device_id,
                           product_id,
                           property,
                           AVG(value_number) AS avg_value,
                           MAX(value_number) AS max_value,
                           MIN(value_number) AS min_value,
                           SUM(value_number) AS sum_value,
                           COUNT(value_number) AS sample_count,
                           last(value_number, ts) AS last_value
                    FROM device_telemetry
                    GROUP BY bucket, tenant_id, device_id, product_id, property
                    WITH NO DATA
                $sql$;
            END IF;
            PERFORM add_continuous_aggregate_policy(
                'device_telemetry_hourly',
                start_offset => INTERVAL '3 days',
                end_offset => INTERVAL '1 hour',
                schedule_interval => INTERVAL '1 hour',
                if_not_exists => true
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'hourly continuous aggregate skipped: %', SQLERRM;
        END;

        -- 2.5 天级连续聚合（长期归档）
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM timescaledb_information.continuous_aggregates
                WHERE view_name = 'device_telemetry_daily'
            ) THEN
                EXECUTE $sql$
                    CREATE MATERIALIZED VIEW device_telemetry_daily
                    WITH (timescaledb.continuous) AS
                    SELECT time_bucket('1 day', ts) AS bucket,
                           tenant_id,
                           device_id,
                           product_id,
                           property,
                           AVG(value_number) AS avg_value,
                           MAX(value_number) AS max_value,
                           MIN(value_number) AS min_value,
                           SUM(value_number) AS sum_value,
                           COUNT(value_number) AS sample_count,
                           last(value_number, ts) AS last_value
                    FROM device_telemetry
                    GROUP BY bucket, tenant_id, device_id, product_id, property
                    WITH NO DATA
                $sql$;
            END IF;
            PERFORM add_continuous_aggregate_policy(
                'device_telemetry_daily',
                start_offset => INTERVAL '30 days',
                end_offset => INTERVAL '1 day',
                schedule_interval => INTERVAL '1 day',
                if_not_exists => true
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'daily continuous aggregate skipped: %', SQLERRM;
        END;

        -- 2.6 有限回填近 7 天历史数据；更早历史由运维按需 refresh_continuous_aggregate 回填
        BEGIN
            CALL refresh_continuous_aggregate('device_telemetry_hourly', now() - INTERVAL '7 days', now() - INTERVAL '1 hour');
            CALL refresh_continuous_aggregate('device_telemetry_daily', now() - INTERVAL '7 days', now() - INTERVAL '1 day');
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'continuous aggregate backfill skipped: %', SQLERRM;
        END;
    END IF;
END $$;
