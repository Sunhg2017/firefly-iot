package com.songhg.firefly.iot.device.dto.devicedata;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Telemetry aggregation bucket result.
 */
@Data
@Schema(description = "Telemetry aggregation bucket")
public class TelemetryAggregateVO {

    @Schema(description = "Time bucket start")
    private LocalDateTime bucket;

    @Schema(description = "Average value", example = "24.3")
    private Double avgVal;

    @Schema(description = "Maximum value", example = "28.1")
    private Double maxVal;

    @Schema(description = "Minimum value", example = "20.5")
    private Double minVal;

    @Schema(description = "Data point count", example = "120")
    private Long count;
}
