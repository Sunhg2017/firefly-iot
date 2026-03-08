package com.songhg.firefly.iot.device.dto.firmware;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

/**
 * Batch bind firmware to multiple devices.
 */
@Data
@Schema(description = "批量设备固件绑定请求")
public class DeviceFirmwareBatchBindDTO {

    @Schema(description = "设备编号列表")
    @NotEmpty(message = "设备ID列表不能为空")
    private List<Long> deviceIds;

    @Schema(description = "固件编号")
    @NotNull(message = "固件ID不能为空")
    private Long firmwareId;

    @Schema(description = "目标固件版本", example = "1.2.0")
    private String version;
}
