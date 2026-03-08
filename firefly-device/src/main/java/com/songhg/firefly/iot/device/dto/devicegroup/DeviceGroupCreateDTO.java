package com.songhg.firefly.iot.device.dto.devicegroup;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Device group creation request.
 */
@Data
@Schema(description = "设备分组创建请求")
public class DeviceGroupCreateDTO {

    @Schema(description = "分组名称", example = "二层传感器")
    @NotBlank(message = "分组名称不能为空")
    @Size(max = 64)
    private String name;

    @Schema(description = "描述")
    @Size(max = 256)
    private String description;

    /** Group type: STATIC or DYNAMIC */
    @Schema(description = "分组类型", example = "STATIC")
    private String type;

    /** Dynamic group SQL/expression rule (only for DYNAMIC type) */
    @Schema(description = "动态分组规则")
    private String dynamicRule;

    /** Parent group ID (for tree structure, null = root) */
    @Schema(description = "父分组编号")
    private Long parentId;
}
