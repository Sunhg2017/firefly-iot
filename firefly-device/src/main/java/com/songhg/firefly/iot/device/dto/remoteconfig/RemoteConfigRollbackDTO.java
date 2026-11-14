package com.songhg.firefly.iot.device.dto.remoteconfig;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
@Schema(description = "回滚远程配置")
public class RemoteConfigRollbackDTO {

    @Schema(description = "回滚到的历史版本", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull(message = "版本号不能为空")
    private Integer version;
}
