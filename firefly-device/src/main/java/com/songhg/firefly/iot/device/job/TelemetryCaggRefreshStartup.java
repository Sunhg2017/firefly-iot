package com.songhg.firefly.iot.device.job;

import com.songhg.firefly.iot.device.config.TelemetryGovernanceProperties;
import com.songhg.firefly.iot.device.service.TelemetryCaggRefreshService;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 启动补刷：进程重启后立即在后台补齐上次停机期间产生的 CAGG 缺口，
 * 不阻塞应用启动；与定时任务共用分布式锁。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TelemetryCaggRefreshStartup {

    private final TelemetryCaggRefreshService refreshService;
    private final TelemetryGovernanceProperties properties;

    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "cagg-gap-refresh");
        thread.setDaemon(true);
        return thread;
    });

    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        if (!properties.isCaggRefreshEnabled() || !properties.isCaggRefreshOnStartup()) {
            return;
        }
        executor.submit(() -> {
            try {
                log.info("CAGG gap refresh on startup begins");
                refreshService.refreshGapWithLock();
            } catch (Exception ex) {
                log.warn("CAGG gap refresh on startup failed: {}", ex.getMessage());
            }
        });
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
    }
}
