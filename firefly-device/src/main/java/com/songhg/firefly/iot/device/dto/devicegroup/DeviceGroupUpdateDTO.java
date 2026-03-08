package com.songhg.firefly.iot.device.dto.devicegroup;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Device group update request.
 */
@Data
@Schema(description = "设备分组更新请求")
public class DeviceGroupUpdateDTO {

    @Schema(description = "分组名称")
    @Size(max = 64)
    private String name;

    @Schema(description = "描述")
    @Size(max = 256)
    private String description;

    @Schema(description = "动态分组规则")
    private String dynamicRule;
}
