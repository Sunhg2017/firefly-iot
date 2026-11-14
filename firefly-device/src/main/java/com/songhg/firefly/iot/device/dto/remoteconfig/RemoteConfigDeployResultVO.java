package com.songhg.firefly.iot.device.dto.remoteconfig;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "远程配置下发结果")
public class RemoteConfigDeployResultVO {

    private int requested;
    private int success;
    private int failed;
}
