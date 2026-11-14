package com.songhg.firefly.iot.device.dto.remoteconfig;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "下载配置下发")
public class RemoteConfigDeployDTO {

    @Schema(description = "指定版本，默认使用当前版本")
    private Integer version;
}
