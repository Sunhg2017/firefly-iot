package com.songhg.firefly.iot.connector.protocol.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MqttConnectionContext {

    private String clientId;
    private String username;
    private String productKey;
    private String deviceName;
    private Long deviceId;
    private Long tenantId;
    private Long productId;

    public MqttSessionRoute toRoute(String nodeId) {
        return MqttSessionRoute.builder()
                .nodeId(nodeId)
                .clientId(clientId)
                .productKey(productKey)
                .deviceName(deviceName)
                .deviceId(deviceId)
                .tenantId(tenantId)
                .productId(productId)
                .build();
    }
}
