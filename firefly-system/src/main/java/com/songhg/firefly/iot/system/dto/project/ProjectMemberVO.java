package com.songhg.firefly.iot.system.dto.project;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Project member view object.
 */
@Data
@Schema(description = "Project member view object")
public class ProjectMemberVO {

    @Schema(description = "Membership ID")
    private Long id;

    @Schema(description = "Project ID")
    private Long projectId;

    @Schema(description = "User ID")
    private Long userId;

    @Schema(description = "Member role in project")
    private String role;

    @Schema(description = "Join time")
    private LocalDateTime createdAt;
}
