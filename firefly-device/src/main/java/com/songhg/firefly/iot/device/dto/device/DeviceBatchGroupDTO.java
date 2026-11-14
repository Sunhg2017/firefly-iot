package com.songhg.firefly.iot.device.dto.device;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "设备批量分组请求")
public class DeviceBatchGroupDTO extends DeviceBatchOperationDTO {

    @Schema(description = "分组编号列表", requiredMode = Schema.RequiredMode.REQUIRED)
    private List<Long> groupIds;

    @Schema(description = "分组动作：REPLACE / ADD / REMOVE", example = "REPLACE")
    private String action = "REPLACE";
}
