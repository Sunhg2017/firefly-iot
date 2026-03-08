package com.songhg.firefly.iot.connector.protocol.tcpudp;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "TCP/UDP 会话绑定上下文")
public class TcpUdpBindingContext {

    @Schema(description = "租户 ID", example = "1001")
    private Long tenantId;

    @Schema(description = "产品 ID", example = "2001")
    private Long productId;

    @Schema(description = "产品 Key", example = "pk_demo_001")
    private String productKey;

    @Schema(description = "设备 ID", example = "3001")
    private Long deviceId;

    @Schema(description = "设备名称", example = "device-001")
    private String deviceName;

    @Schema(description = "绑定时间戳", example = "1717000000000")
    private long bindTime;
}
