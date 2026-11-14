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
}
