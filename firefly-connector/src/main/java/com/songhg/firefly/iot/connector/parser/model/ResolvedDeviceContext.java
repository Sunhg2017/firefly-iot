package com.songhg.firefly.iot.connector.parser.model;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ResolvedDeviceContext {

    private Long tenantId;
    private Long productId;
    private Long deviceId;
    private String deviceName;
    private String productKey;
}
