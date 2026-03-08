package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

@Data
public class DeviceLocatorResolveRequestDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String productKey;
    private String locatorType;
    private String locatorValue;
}
