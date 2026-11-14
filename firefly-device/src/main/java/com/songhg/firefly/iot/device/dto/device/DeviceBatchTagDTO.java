package com.songhg.firefly.iot.device.dto.device;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "设备批量打标请求")
public class DeviceBatchTagDTO extends DeviceBatchOperationDTO {

    @Schema(description = "标签编号列表", requiredMode = Schema.RequiredMode.REQUIRED)
    private List<Long> tagIds;

    @Schema(description = "true=覆盖标签，false=追加标签", example = "true")
    private Boolean overwrite = true;
}
