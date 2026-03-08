package com.songhg.firefly.iot.device.dto.ota;

import com.songhg.firefly.iot.common.enums.OtaTaskType;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * OTA upgrade task creation request.
 */
@Data
@Schema(description = "升级任务创建请求")
public class OtaTaskCreateDTO {

    @Schema(description = "任务名称", example = "批量升级到2.0")
    @NotBlank(message = "任务名称不能为空")
    private String name;

    @Schema(description = "描述")
    private String description;

    @Schema(description = "产品编号")
    @NotNull(message = "产品ID不能为空")
    private Long productId;

    @Schema(description = "固件编号")
    @NotNull(message = "固件ID不能为空")
    private Long firmwareId;

    @Schema(description = "任务类型")
    @NotNull(message = "任务类型不能为空")
    private OtaTaskType taskType;

    @Schema(description = "源版本", example = "1.0.0")
    private String srcVersion;

    @Schema(description = "目标版本", example = "2.0.0")
    @NotBlank(message = "目标版本不能为空")
    private String destVersion;

    @Schema(description = "灰度比例", example = "10")
    private Integer grayRatio;
}
