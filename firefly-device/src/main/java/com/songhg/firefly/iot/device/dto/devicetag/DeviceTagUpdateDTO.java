package com.songhg.firefly.iot.device.dto.devicetag;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Device tag update request.
 */
@Data
@Schema(description = "设备标签更新请求")
public class DeviceTagUpdateDTO {

    @Schema(description = "标签值", example = "warehouse-B")
    @Size(max = 128)
    private String tagValue;

    @Schema(description = "显示颜色", example = "#52c41a")
    private String color;

    @Schema(description = "描述")
    @Size(max = 256)
    private String description;
}
