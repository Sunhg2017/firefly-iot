package com.songhg.firefly.iot.device.dto.device;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

/**
 * Device update request.
 */
@Data
@Schema(description = "设备更新请求")
public class DeviceUpdateDTO {

    /** Human-readable display name */
    @Schema(description = "显示昵称", example = "温度传感器1号")
    private String nickname;

    /** Device description */
    @Schema(description = "描述")
    private String description;

    /** Comma-separated tags */
    @Schema(description = "标签（逗号分隔）", example = "warehouse,floor-2")
    private List<Long> tagIds;

    /** Optional project re-assignment */
    @Schema(description = "项目编号")
    private Long projectId;
}
