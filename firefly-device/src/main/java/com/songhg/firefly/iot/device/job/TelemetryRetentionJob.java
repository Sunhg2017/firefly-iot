package com.songhg.firefly.iot.device.job;

import com.songhg.firefly.iot.device.service.TelemetryRetentionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 时序数据保留清理任务：按租户保留策略清理过期遥测原始数据。
 * 执行时间由 {@code firefly.telemetry.retention-cleanup-cron} 控制，默认每日 03:10。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TelemetryRetentionJob {

    private final TelemetryRetentionService retentionService;

    @Scheduled(cron = "${firefly.telemetry.retention-cleanup-cron:0 10 3 * * ?}")
    public void cleanupExpiredTelemetry() {
        try {
            retentionService.cleanupExpiredTelemetry();
        } catch (Exception ex) {
            log.error("Telemetry retention cleanup job failed: {}", ex.getMessage(), ex);
        }
    }
}
