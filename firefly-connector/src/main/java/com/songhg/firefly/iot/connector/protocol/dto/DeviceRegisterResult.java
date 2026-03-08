package com.songhg.firefly.iot.connector.protocol.dto;

import lombok.Data;

/**
 * Device dynamic registration result.
 */
@Data
public class DeviceRegisterResult {

    private boolean success;
    private Long deviceId;
    private Long tenantId;
    private Long productId;
    private String deviceName;
    private String deviceSecret;
    private String errorCode;

    public static DeviceRegisterResult success(Long deviceId, Long tenantId, Long productId,
                                               String deviceName, String deviceSecret) {
        DeviceRegisterResult result = new DeviceRegisterResult();
        result.success = true;
        result.deviceId = deviceId;
        result.tenantId = tenantId;
        result.productId = productId;
        result.deviceName = deviceName;
        result.deviceSecret = deviceSecret;
        return result;
    }

    public static DeviceRegisterResult fail(String errorCode) {
        DeviceRegisterResult result = new DeviceRegisterResult();
        result.success = false;
        result.errorCode = errorCode;
        return result;
    }
}
