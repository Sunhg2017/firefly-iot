package com.songhg.firefly.iot.device.dto.devicedata;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Single telemetry data point.
 */
@Data
@Schema(description = "Telemetry data point")
public class TelemetryDataVO {

    @Schema(description = "Timestamp")
    private LocalDateTime ts;

    @Schema(description = "Device ID")
    private Long deviceId;

    @Schema(description = "Property key", example = "temperature")
    private String property;

    @Schema(description = "Numeric value", example = "25.5")
    private Double valueNumber;

    @Schema(description = "String value")
    private String valueString;

    @Schema(description = "Boolean value")
    private Boolean valueBool;
}
