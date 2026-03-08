package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

@Data
public class ProtocolParserDebugIdentityDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String mode;
    private String productKey;
    private String deviceName;
    private String locatorType;
    private String locatorValue;
    private Long deviceId;
}
