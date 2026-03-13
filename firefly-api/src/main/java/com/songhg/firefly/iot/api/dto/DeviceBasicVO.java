package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

/**
 * 设备基础信息（跨服务传输用）
 */
@Data
public class DeviceBasicVO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private Long id;
    private String deviceName;
    private String nickname;
    private Long productId;
    private String productName;
    private Long tenantId;
    private Long projectId;
    private String status;
    private String onlineStatus;
}
