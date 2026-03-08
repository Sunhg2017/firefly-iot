package com.songhg.firefly.iot.system.dto.permission;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Permission resource creation request.
 */
@Data
@Schema(description = "Permission resource creation request")
public class PermissionResourceCreateDTO {

    @Schema(description = "Parent resource ID")
    private Long parentId;

    @Schema(description = "Permission code", example = "device:read")
    @NotBlank(message = "权限编码不能为空")
    @Size(max = 64)
    private String code;

    @Schema(description = "Permission name", example = "View Devices")
    @NotBlank(message = "权限名称不能为空")
    @Size(max = 128)
    private String name;

    @Schema(description = "Resource type (MENU / BUTTON / API)")
    @NotBlank(message = "类型不能为空")
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
