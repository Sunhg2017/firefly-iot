package com.songhg.firefly.iot.device.dto.device;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "设备三元组视图")
public class DeviceCredentialVO {

    @Schema(description = "设备ID")
    private Long id;

    @Schema(description = "产品ID")
    private Long productId;

    @Schema(description = "产品Key")
    private String productKey;

    @Schema(description = "产品名称")
    private String productName;

    @Schema(description = "设备名称")
    private String deviceName;

    @Schema(description = "设备别名")
    private String nickname;

    @Schema(description = "设备密钥")
    private String deviceSecret;
}
