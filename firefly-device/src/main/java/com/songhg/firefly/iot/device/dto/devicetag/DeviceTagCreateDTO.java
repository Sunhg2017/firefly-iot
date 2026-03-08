package com.songhg.firefly.iot.device.dto.devicetag;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Device tag creation request.
 */
@Data
@Schema(description = "设备标签创建请求")
public class DeviceTagCreateDTO {

    @Schema(description = "标签键", example = "location")
    @NotBlank(message = "标签键不能为空")
    @Size(max = 64)
    private String tagKey;

    @Schema(description = "标签值", example = "warehouse-A")
    @NotBlank(message = "标签值不能为空")
    @Size(max = 128)
    private String tagValue;

    @Schema(description = "显示颜色", example = "#1890ff")
    private String color;

    @Schema(description = "描述")
    @Size(max = 256)
    private String description;
}
