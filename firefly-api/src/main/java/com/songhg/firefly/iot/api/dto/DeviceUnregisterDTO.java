package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

/**
 * Device dynamic unregister result for cross-service transport.
 */
@Data
public class DeviceUnregisterDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private boolean success;
    private boolean removed;
    private String deviceName;
    private String errorCode;
}
