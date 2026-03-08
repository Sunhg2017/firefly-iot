package com.songhg.firefly.iot.device.dto.devicedata;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Latest telemetry value for a single property.
 */
@Data
@Schema(description = "Latest telemetry value per property")
public class TelemetryLatestVO {

    @Schema(description = "Property key", example = "temperature")
    private String property;

    @Schema(description = "Numeric value", example = "25.5")
    private Double valueNumber;

    @Schema(description = "String value")
    private String valueString;

    @Schema(description = "Boolean value")
    private Boolean valueBool;

    @Schema(description = "Last update timestamp")
    private LocalDateTime ts;
}
