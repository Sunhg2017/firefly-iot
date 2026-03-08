package com.songhg.firefly.iot.device.dto.devicetag;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Device tag view object.
 */
@Data
@Schema(description = "Device tag view object")
public class DeviceTagVO {

    @Schema(description = "Tag ID")
    private Long id;

    @Schema(description = "Tag key", example = "location")
    private String tagKey;

    @Schema(description = "Tag value", example = "warehouse-A")
    private String tagValue;

    @Schema(description = "Display color (hex)")
    private String color;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Number of devices with this tag")
    private Integer deviceCount;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;

    @Schema(description = "Last update time")
    private LocalDateTime updatedAt;
}
