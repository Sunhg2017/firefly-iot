package com.songhg.firefly.iot.connector.protocol.downstream;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResolvedDeviceIdentity {

    private Long deviceId;
    private Long tenantId;
    private Long productId;
    private String productKey;
    private String deviceName;
}
