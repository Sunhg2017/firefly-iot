package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.util.List;

/**
 * Device dynamic registration request for cross-service transport.
 */
@Data
public class DeviceRegisterRequestDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String productKey;
    private String productSecret;
    private String deviceName;
    private String nickname;
    private String description;
    private String tags;
    private List<DeviceLocatorInputDTO> locators;
}
