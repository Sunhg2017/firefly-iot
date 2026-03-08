package com.songhg.firefly.iot.system.dto.project;

import com.songhg.firefly.iot.common.enums.ProjectStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Project view object.
 */
@Data
@Schema(description = "Project view object")
public class ProjectVO {

    @Schema(description = "Project ID")
    private Long id;

    @Schema(description = "Project code")
    private String code;

    @Schema(description = "Project name")
    private String name;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Status")
    private ProjectStatus status;

    @Schema(description = "Creator user ID")
    private Long createdBy;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;

    @Schema(description = "Last update time")
    private LocalDateTime updatedAt;
}
