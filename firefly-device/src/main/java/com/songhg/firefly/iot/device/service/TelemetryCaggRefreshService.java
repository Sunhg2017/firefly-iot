package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.device.config.TelemetryGovernanceProperties;
import com.songhg.firefly.iot.device.entity.TelemetryCaggRefreshState;
import com.songhg.firefly.iot.device.mapper.TelemetryCaggRefreshMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 连续聚合（CAGG）缺口补刷。
 *
 * <p>TimescaleDB continuous aggregate policy 只在一个有限窗口内自动刷新
 * （小时聚合 start_offset=3 天、天聚合 30 天）。系统停机或长时间未写入超过该窗口后，
 * policy 不会回补缺口，导致降采样数据永久缺失。本服务按持久化水位
 * {@code telemetry_cagg_refresh_state.refreshed_until} 到当前时间逐批调用
 * {@code refresh_continuous_aggregate}，把缺口补齐。</p>
 *
 * <p>水位每成功刷新一批后前进一次，因此中途失败只会重试未完成区间，不会重复处理已成功区间。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TelemetryCaggRefreshService {

    private static final String LOCK_KEY = "lock:job:telemetry-cagg-refresh";
    private static final Duration LOCK_TTL = Duration.ofMinutes(10);

    /**
     * 单次补刷最多窗口数，防止异常情况下长时间占用调度线程。
     */
    private static final int MAX_WINDOWS_PER_RUN = 500;

    private static final List<CaggSpec> CAGG_SPECS = List.of(
            new CaggSpec("device_telemetry_hourly", Duration.ofHours(1)),
            new CaggSpec("device_telemetry_daily", Duration.ofDays(1))
    );

    private final TelemetryCaggRefreshMapper refreshMapper;
    private final TelemetryGovernanceProperties properties;
    private final StringRedisTemplate redisTemplate;

    /**
     * 带分布式锁的补刷入口：多副本/定时任务与启动补刷并发时只有一个执行。
     */
    public void refreshGapWithLock() {
        if (!properties.isCaggRefreshEnabled()) {
            log.debug("CAGG gap refresh disabled by configuration");
            return;
        }
        String token = UUID.randomUUID().toString();
        Boolean acquired;
        try {
            acquired = redisTemplate.opsForValue().setIfAbsent(LOCK_KEY, token, LOCK_TTL);
        } catch (Exception ex) {
            log.warn("CAGG gap refresh lock check failed, skip this round: {}", ex.getMessage());
            return;
        }
        if (!Boolean.TRUE.equals(acquired)) {
            log.info("CAGG gap refresh skipped because another instance holds the lock");
            return;
        }
        try {
            refreshGap();
        } finally {
            try {
                redisTemplate.delete(LOCK_KEY);
            } catch (Exception ex) {
                log.warn("Failed to release CAGG gap refresh lock: {}", ex.getMessage());
            }
        }
    }

    /**
     * 依次补刷各连续聚合；单个聚合失败只记录日志，不影响其他聚合，水位保留在最后成功点。
     */
    public void refreshGap() {
        for (CaggSpec spec : CAGG_SPECS) {
            try {
                refreshCagg(spec);
            } catch (Exception ex) {
                log.warn("CAGG gap refresh failed: cagg={}, error={}", spec.name(), ex.getMessage());
            }
        }
    }

    private void refreshCagg(CaggSpec spec) {
        LocalDateTime endLimit = now().minus(spec.policyLag());
        TelemetryCaggRefreshState state = refreshMapper.selectState(spec.name());
        LocalDateTime start;
        if (state == null || state.getRefreshedUntil() == null) {
            // 首次运行（或水位丢失）：按最大回看天数回填，避免无限向前刷新。
            start = endLimit.minusDays(Math.max(1, properties.getCaggRefreshMaxLookbackDays()));
        } else {
            // 与上次水位重叠一点，覆盖边界数据。
            start = state.getRefreshedUntil().minusMinutes(Math.max(0, properties.getCaggRefreshOverlapMinutes()));
        }
        if (!start.isBefore(endLimit)) {
            log.debug("No CAGG gap to refresh: cagg={}, watermark={}, endLimit={}",
                    spec.name(), start, endLimit);
            return;
        }

        int batchHours = Math.max(1, properties.getCaggRefreshBatchHours());
        LocalDateTime cursor = start;
        int windows = 0;
        while (cursor.isBefore(endLimit) && windows < MAX_WINDOWS_PER_RUN) {
            LocalDateTime windowEnd = cursor.plusHours(batchHours);
            if (windowEnd.isAfter(endLimit)) {
                windowEnd = endLimit;
            }
            refreshMapper.refreshContinuousAggregate(spec.name(), cursor, windowEnd);
            // 每批成功后再推进水位，保证失败重试从最后成功点继续。
            refreshMapper.upsertState(spec.name(), windowEnd);
            cursor = windowEnd;
            windows++;
        }
        log.info("CAGG gap refresh finished: cagg={}, from={}, to={}, windows={}",
                spec.name(), start, cursor, windows);
    }

    protected LocalDateTime now() {
        return LocalDateTime.now();
    }

    private record CaggSpec(String name, Duration policyLag) {
    }
}
