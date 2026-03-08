package com.songhg.firefly.iot.device.dto.firmware;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Device firmware upgrade status report.
 */
@Data
@Schema(description = "设备固件升级状态")
public class DeviceFirmwareStatusDTO {

    @Schema(description = "升级状态", example = "DOWNLOADING")
    @NotBlank(message = "升级状态不能为空")
    private String status;

    @Schema(description = "升级进度百分比", example = "45")
    private Integer progress;

    @Schema(description = "目标固件版本", example = "1.2.0")
    private String targetVersion;
}
