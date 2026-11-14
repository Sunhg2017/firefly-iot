package com.songhg.firefly.iot.device.job;

import com.songhg.firefly.iot.device.service.TelemetryRetentionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.UUID;

/**
 * 时序数据保留清理任务：按租户保留策略清理过期遥测原始数据。
 * 执行时间由 {@code firefly.telemetry.retention-cleanup-cron} 控制，默认每日 03:10。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TelemetryRetentionJob {

    private static final String LOCK_KEY = "lock:job:telemetry-retention";
    private static final Duration LOCK_TTL = Duration.ofMinutes(10);

    private final TelemetryRetentionService retentionService;
    private final StringRedisTemplate redisTemplate;

    @Scheduled(cron = "${firefly.telemetry.retention-cleanup-cron:0 10 3 * * ?}")
    public void cleanupExpiredTelemetry() {
        String token = UUID.randomUUID().toString();
        Boolean acquired = null;
        try {
            acquired = redisTemplate.opsForValue().setIfAbsent(LOCK_KEY, token, LOCK_TTL);
        } catch (Exception ex) {
            log.warn("Telemetry retention lock check failed, skip this round: {}", ex.getMessage());
            return;
        }
        if (!Boolean.TRUE.equals(acquired)) {
            log.info("Telemetry retention cleanup skipped because another instance holds the lock");
            return;
        }
        try {
            retentionService.cleanupExpiredTelemetry();
        } catch (Exception ex) {
            log.error("Telemetry retention cleanup job failed: {}", ex.getMessage(), ex);
        } finally {
            try {
                redisTemplate.delete(LOCK_KEY);
            } catch (Exception ex) {
                log.warn("Failed to release telemetry retention lock: {}", ex.getMessage());
            }
        }
    }
}
