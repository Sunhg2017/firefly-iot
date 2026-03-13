package com.songhg.firefly.iot.connector.protocol.dto;

import lombok.Data;

/**
 * Device dynamic unregister result.
 */
@Data
public class DeviceUnregisterResult {

    private boolean success;
    private boolean removed;
    private String deviceName;
    private String errorCode;

    public static DeviceUnregisterResult success(String deviceName, boolean removed) {
        DeviceUnregisterResult result = new DeviceUnregisterResult();
        result.success = true;
        result.deviceName = deviceName;
        result.removed = removed;
        return result;
    }

    public static DeviceUnregisterResult fail(String errorCode) {
        DeviceUnregisterResult result = new DeviceUnregisterResult();
        result.success = false;
        result.errorCode = errorCode;
        return result;
    }
}
