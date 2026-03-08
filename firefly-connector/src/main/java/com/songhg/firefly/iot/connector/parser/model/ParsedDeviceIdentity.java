package com.songhg.firefly.iot.connector.parser.model;

import lombok.Data;

@Data
public class ParsedDeviceIdentity {

    private String mode;
    private String productKey;
    private String deviceName;
    private String locatorType;
    private String locatorValue;
}
