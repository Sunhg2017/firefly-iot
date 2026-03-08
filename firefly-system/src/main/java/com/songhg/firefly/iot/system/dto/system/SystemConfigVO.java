package com.songhg.firefly.iot.system.dto.system;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * System config view object.
 */
@Data
@Schema(description = "System config view object")
public class SystemConfigVO {

    @Schema(description = "Config ID")
    private Long id;

    @Schema(description = "Config group")
    private String configGroup;

    @Schema(description = "Config key")
    private String configKey;

    @Schema(description = "Config value")
    private String configValue;

    @Schema(description = "Value type")
    private String valueType;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Last update time")
    private LocalDateTime updatedAt;
}
