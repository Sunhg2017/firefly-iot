package com.songhg.firefly.iot.data.scheduler;

import com.songhg.firefly.iot.data.service.ApiAccessLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * API 调用统计日报聚合定时任务。
 * 每天凌晨 01:00 聚合前一天的 API 调用日志写入 api_call_stats_daily。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ApiStatsAggregationTask {

    private final ApiAccessLogService apiAccessLogService;

    @Scheduled(cron = "0 0 1 * * ?")
    public void aggregateYesterdayStats() {
        LocalDate yesterday = LocalDate.now().minusDays(1);
        log.info("Starting daily API stats aggregation for {}", yesterday);
        try {
            apiAccessLogService.aggregateDaily(yesterday);
            log.info("Daily API stats aggregation completed for {}", yesterday);
        } catch (Exception e) {
            log.error("Daily API stats aggregation failed for {}", yesterday, e);
        }
    }
}
