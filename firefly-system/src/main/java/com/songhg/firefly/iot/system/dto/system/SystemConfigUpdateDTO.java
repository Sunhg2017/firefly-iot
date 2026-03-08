package com.songhg.firefly.iot.system.dto.system;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * System config update request.
 */
@Data
@Schema(description = "System config update request")
public class SystemConfigUpdateDTO {

    @Schema(description = "Config key", example = "site.name")
    @NotBlank(message = "配置键不能为空")
    private String configKey;

    @Schema(description = "Config value")
    private String configValue;

    @Schema(description = "Description")
    private String description;
}
