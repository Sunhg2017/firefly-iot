package com.songhg.firefly.iot.device.job;

import com.songhg.firefly.iot.device.service.TelemetryCaggRefreshService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 连续聚合缺口补刷任务：默认每日 03:30 执行，按持久化水位补刷停机期间的降采样缺口。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TelemetryCaggRefreshJob {

    private final TelemetryCaggRefreshService refreshService;

    @Scheduled(cron = "${firefly.telemetry.cagg-refresh-cron:0 30 3 * * ?}")
    public void refreshGap() {
        try {
            refreshService.refreshGapWithLock();
        } catch (Exception ex) {
            log.error("CAGG gap refresh job failed: {}", ex.getMessage(), ex);
        }
    }
}
