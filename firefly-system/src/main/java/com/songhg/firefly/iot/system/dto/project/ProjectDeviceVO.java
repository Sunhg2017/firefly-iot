package com.songhg.firefly.iot.system.dto.project;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Project-device binding view object.
 */
@Data
@Schema(description = "Project-device binding view object")
public class ProjectDeviceVO {

    @Schema(description = "Binding ID")
    private Long id;

    @Schema(description = "Project ID")
    private Long projectId;

    @Schema(description = "Device ID")
    private Long deviceId;

    @Schema(description = "Binding time")
    private LocalDateTime createdAt;
}
