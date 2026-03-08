package com.songhg.firefly.iot.device.dto.firmware;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Firmware update request.
 */
@Data
@Schema(description = "固件更新请求")
public class FirmwareUpdateDTO {

    @Schema(description = "显示名称")
    @Size(max = 128)
    private String displayName;

    @Schema(description = "描述")
    @Size(max = 512)
    private String description;
}
