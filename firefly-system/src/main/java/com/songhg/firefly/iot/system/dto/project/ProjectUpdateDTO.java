package com.songhg.firefly.iot.system.dto.project;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * Project update request.
 */
@Data
@Schema(description = "Project update request")
public class ProjectUpdateDTO {

    @Schema(description = "Project name")
    private String name;

    @Schema(description = "Description")
    private String description;
}
