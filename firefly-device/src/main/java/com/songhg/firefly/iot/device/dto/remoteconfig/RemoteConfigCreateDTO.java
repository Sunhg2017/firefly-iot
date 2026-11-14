package com.songhg.firefly.iot.device.dto.remoteconfig;

import com.songhg.firefly.iot.common.enums.RemoteConfigTargetType;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
@Schema(description = "创建远程配置")
public class RemoteConfigCreateDTO {

    @Schema(description = "配置名称", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotBlank(message = "配置名称不能为空")
    private String name;

    private String description;
    private Long projectId;

    @Schema(description = "下发目标类型", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull(message = "目标类型不能为空")
    private RemoteConfigTargetType targetType;

    private Long targetId;

    @Schema(description = "配置内容 JSON", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotBlank(message = "配置内容不能为空")
    private String configJson;
}
