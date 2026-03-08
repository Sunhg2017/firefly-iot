package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

/**
 * Device dynamic registration result for cross-service transport.
 */
@Data
public class DeviceRegisterDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private boolean success;
    private Long deviceId;
    private Long tenantId;
    private Long productId;
    private String deviceName;
    private String deviceSecret;
    private String errorCode;
}
