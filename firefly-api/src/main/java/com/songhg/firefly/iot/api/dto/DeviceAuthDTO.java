package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

/**
 * 设备认证结果（跨服务传输用）
 */
@Data
public class DeviceAuthDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private boolean success;
    private Long deviceId;
    private Long tenantId;
    private Long productId;
    private String errorCode;
}
