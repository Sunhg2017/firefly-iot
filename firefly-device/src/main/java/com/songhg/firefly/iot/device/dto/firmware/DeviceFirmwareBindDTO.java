package com.songhg.firefly.iot.device.dto.firmware;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Bind a firmware version to a specific device.
 */
@Data
@Schema(description = "设备固件绑定请求")
public class DeviceFirmwareBindDTO {

    @Schema(description = "设备编号")
    @NotNull(message = "设备ID不能为空")
    private Long deviceId;

    @Schema(description = "固件编号")
    @NotNull(message = "固件ID不能为空")
    private Long firmwareId;
}
