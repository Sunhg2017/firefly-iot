package com.songhg.firefly.iot.device.dto.devicetag;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Device-tag binding view object.
 */
@Data
@Schema(description = "Device-tag binding")
public class DeviceTagBindingVO {

    @Schema(description = "Binding ID")
    private Long id;

    @Schema(description = "Tag ID")
    private Long tagId;

    @Schema(description = "Device ID")
    private Long deviceId;

    @Schema(description = "Device name")
    private String deviceName;

    @Schema(description = "Device nickname")
    private String nickname;

    @Schema(description = "Product ID")
    private Long productId;

    @Schema(description = "Product name")
    private String productName;

    @Schema(description = "Binding time")
    private LocalDateTime createdAt;
}
