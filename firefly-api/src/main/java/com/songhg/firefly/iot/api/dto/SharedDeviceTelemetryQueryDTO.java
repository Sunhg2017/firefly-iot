package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

/**
 * Shared telemetry query request used by the rule service.
 */
@Data
public class SharedDeviceTelemetryQueryDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private Long ownerTenantId;
    private Long deviceId;
    private String property;
    private String startTime;
    private String endTime;
    private Integer limit;
}
