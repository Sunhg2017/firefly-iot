package com.songhg.firefly.iot.device.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 时序数据治理配置。
 */
@Data
@Component
@ConfigurationProperties(prefix = "firefly.telemetry")
public class TelemetryGovernanceProperties {

    /**
     * 全局默认保留天数，未单独配置的租户使用该值。
     */
    private int defaultRetentionDays = 90;

    /**
     * 租户可设置的最大保留天数，需与迁移脚本中全局 drop_chunks 上限保持一致。
     */
    private int globalMaxRetentionDays = 365;

    /**
     * 单批删除行数，避免大表长事务。
     */
    private int cleanupBatchSize = 500;

    /**
     * 单次清理最多执行的批次数，防止单次任务运行过久。
     */
    private int cleanupMaxBatches = 200;

    /**
     * 是否启用连续聚合（CAGG）缺口补刷。
     */
    private boolean caggRefreshEnabled = true;

    /**
     * 是否在应用启动后异步执行一次缺口补刷。
     */
    private boolean caggRefreshOnStartup = true;

    /**
     * 单批补刷小时数，控制单次 refresh_continuous_aggregate 的区间大小。
     */
    private int caggRefreshBatchHours = 24;

    /**
     * 首次运行（无水位）时最多向前回看的天数。
     */
    private int caggRefreshMaxLookbackDays = 30;

    /**
     * 与上次水位的重叠分钟数，覆盖边界数据。
     */
    private int caggRefreshOverlapMinutes = 10;
}
