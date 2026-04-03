package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * Cross-service telemetry point payload.
 */
@Data
public class DeviceTelemetryPointDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private LocalDateTime ts;
    private Long deviceId;
    private String property;
    private Double valueNumber;
    private String valueString;
    private Boolean valueBool;
}
