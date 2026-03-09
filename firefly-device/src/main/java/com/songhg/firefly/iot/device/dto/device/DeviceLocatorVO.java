package com.songhg.firefly.iot.device.dto.device;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class DeviceLocatorVO {

    private Long id;
    private Long deviceId;
    private Long productId;
    private String locatorType;
    private String locatorValue;
    private Boolean primaryLocator;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
