package com.songhg.firefly.iot.device.dto.remoteconfig;

import com.songhg.firefly.iot.common.enums.RemoteConfigTargetType;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "更新远程配置")
public class RemoteConfigUpdateDTO {

    private String name;
    private String description;
    private Long projectId;
    private RemoteConfigTargetType targetType;
    private Long targetId;
    private String configJson;
}
