package com.songhg.firefly.iot.device.dto.device;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class DeviceLocatorCreateDTO {

    @NotBlank
    @Size(max = 32)
    private String locatorType;

    @NotBlank
    @Size(max = 256)
    private String locatorValue;

    private Boolean primaryLocator;
}
