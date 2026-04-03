package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * Cross-service latest telemetry snapshot payload.
 */
@Data
public class DeviceTelemetrySnapshotDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String property;
    private Double valueNumber;
    private String valueString;
    private Boolean valueBool;
    private LocalDateTime ts;
}
