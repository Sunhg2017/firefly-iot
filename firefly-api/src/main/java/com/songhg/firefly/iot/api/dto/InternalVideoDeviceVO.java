package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 视频设备基础信息（跨服务传输用）。
 */
@Data
public class InternalVideoDeviceVO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private Long deviceId;
    private Long tenantId;
    private Long productId;
    private String productKey;
    private String name;
    private String gbDeviceId;
    private String gbDomain;
    private String transport;
    private String sipPassword;
    private String streamMode;
    private String ip;
    private Integer port;
    private String sourceUrl;
    private String manufacturer;
    private String model;
    private String firmware;
    private String status;
    private LocalDateTime lastRegisteredAt;
}
