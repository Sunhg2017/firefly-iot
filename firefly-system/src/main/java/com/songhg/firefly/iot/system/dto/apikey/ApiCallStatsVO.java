package com.songhg.firefly.iot.system.dto.apikey;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;

/**
 * API call statistics view object.
 */
@Data
@Schema(description = "API call daily statistics")
public class ApiCallStatsVO {

    @Schema(description = "Statistics date")
    private LocalDate statDate;

    @Schema(description = "Total calls")
    private Long totalCalls;

    @Schema(description = "Successful calls")
    private Long successCalls;

    @Schema(description = "Error calls")
    private Long errorCalls;

    @Schema(description = "Average latency in ms")
    private Integer avgLatencyMs;

    @Schema(description = "Max latency in ms")
    private Integer maxLatencyMs;

    @Schema(description = "P99 latency in ms")
    private Integer p99LatencyMs;
}
