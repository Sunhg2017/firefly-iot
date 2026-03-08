package com.songhg.firefly.iot.connector.protocol.dto;

import lombok.Data;

/**
 * 设备认证结果
 */
@Data
public class DeviceAuthResult {
    private boolean success;
    private Long deviceId;
    private Long tenantId;
    private Long productId;
    private String errorCode;

    public static DeviceAuthResult success(Long deviceId) {
        DeviceAuthResult r = new DeviceAuthResult();
        r.success = true;
        r.deviceId = deviceId;
        return r;
    }

    public static DeviceAuthResult success(Long deviceId, Long tenantId, Long productId) {
        DeviceAuthResult r = new DeviceAuthResult();
        r.success = true;
        r.deviceId = deviceId;
        r.tenantId = tenantId;
        r.productId = productId;
        return r;
    }

    public static DeviceAuthResult fail(String errorCode) {
        DeviceAuthResult r = new DeviceAuthResult();
        r.success = false;
        r.errorCode = errorCode;
        return r;
    }
}
