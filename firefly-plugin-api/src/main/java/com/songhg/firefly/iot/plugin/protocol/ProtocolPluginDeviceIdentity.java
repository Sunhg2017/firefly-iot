package com.songhg.firefly.iot.plugin.protocol;

import lombok.Data;

@Data
public class ProtocolPluginDeviceIdentity {

    private String mode;
    private String productKey;
    private String deviceName;
    private String locatorType;
    private String locatorValue;
}
