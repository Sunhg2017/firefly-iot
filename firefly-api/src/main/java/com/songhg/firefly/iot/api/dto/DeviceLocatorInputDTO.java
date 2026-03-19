package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

/**
 * Device locator input used during registration and import flows.
 */
@Data
public class DeviceLocatorInputDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String locatorType;
    private String locatorValue;
    private Boolean primaryLocator;
}
