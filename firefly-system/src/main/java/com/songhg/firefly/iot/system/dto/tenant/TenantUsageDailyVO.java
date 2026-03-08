package com.songhg.firefly.iot.system.dto.tenant;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;

/**
 * Tenant daily usage statistics.
 */
@Data
@Schema(description = "Tenant daily usage statistics")
public class TenantUsageDailyVO {

    @Schema(description = "Statistics date")
    private LocalDate date;

    @Schema(description = "Device count")
    private Integer deviceCount;

    @Schema(description = "Peak online devices")
    private Integer deviceOnlinePeak;

    @Schema(description = "Message count")
    private Long messageCount;

    @Schema(description = "Peak message rate")
    private Integer messageRatePeak;

    @Schema(description = "Rule count")
    private Integer ruleCount;

    @Schema(description = "API call count")
    private Long apiCallCount;

    @Schema(description = "Storage in bytes")
    private Long storageBytes;

    @Schema(description = "Video channel count")
    private Integer videoChannelCount;

    @Schema(description = "Video storage in bytes")
    private Long videoStorageBytes;
}
