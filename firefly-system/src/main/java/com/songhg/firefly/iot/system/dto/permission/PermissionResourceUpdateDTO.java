package com.songhg.firefly.iot.system.dto.permission;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Permission resource update request.
 */
@Data
@Schema(description = "Permission resource update request")
public class PermissionResourceUpdateDTO {

    @Schema(description = "Parent resource ID")
    private Long parentId;

    @Schema(description = "Permission name")
    @Size(max = 128)
    private String name;

    @Schema(description = "Resource type (MENU / BUTTON / API)")
    private String type;

    @Schema(description = "Icon name")
    private String icon;

    @Schema(description = "Resource path")
    private String path;

    @Schema(description = "Sort order")
    private Integer sortOrder;

    @Schema(description = "Whether enabled")
    private Boolean enabled;

    @Schema(description = "Description")
    @Size(max = 256)
    private String description;
}
