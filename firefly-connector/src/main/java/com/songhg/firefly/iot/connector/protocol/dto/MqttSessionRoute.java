package com.songhg.firefly.iot.connector.protocol.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MqttSessionRoute {

    private String nodeId;
    private String clientId;
    private String productKey;
    private String deviceName;
    private Long deviceId;
    private Long tenantId;
    private Long productId;
}
