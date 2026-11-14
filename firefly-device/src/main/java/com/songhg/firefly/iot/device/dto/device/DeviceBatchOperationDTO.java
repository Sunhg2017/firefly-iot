package com.songhg.firefly.iot.device.dto.device;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "设备批量操作请求")
public class DeviceBatchOperationDTO {

    @Schema(description = "设备编号列表", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotEmpty(message = "设备列表不能为空")
    private List<Long> deviceIds;
}
