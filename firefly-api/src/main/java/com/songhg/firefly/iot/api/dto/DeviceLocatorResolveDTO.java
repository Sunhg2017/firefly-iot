package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

@Data
public class DeviceLocatorResolveDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private boolean success;
    private Long deviceId;
    private Long tenantId;
    private Long productId;
    private String deviceName;
    private String errorCode;
}
