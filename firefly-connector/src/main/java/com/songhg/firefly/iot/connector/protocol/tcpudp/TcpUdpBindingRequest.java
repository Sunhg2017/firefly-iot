package com.songhg.firefly.iot.connector.protocol.tcpudp;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
@Schema(description = "TCP/UDP 会话绑定请求")
public class TcpUdpBindingRequest {

    @Schema(description = "UDP 对端地址，仅 UDP 绑定时需要", example = "192.168.1.100")
    private String address;

    @Min(1)
    @Schema(description = "UDP 对端端口，仅 UDP 绑定时需要", example = "8901")
    private Integer port;

    @NotNull
    @Schema(description = "产品 ID", requiredMode = Schema.RequiredMode.REQUIRED, example = "2001")
    private Long productId;

    @Schema(description = "租户 ID，可不填，默认按产品自动回填", example = "1001")
    private Long tenantId;

    @Schema(description = "产品 Key，可不填，默认按产品自动回填", example = "pk_demo_001")
    private String productKey;

    @Schema(description = "设备 ID，填入后可直接绑定到已知设备", example = "3001")
    private Long deviceId;

    @Schema(description = "设备名称，可选", example = "device-001")
    private String deviceName;
}
