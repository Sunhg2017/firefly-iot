package com.songhg.firefly.iot.system.dto.role;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "Role permission group")
public class RolePermissionGroupVO {

    @Schema(description = "Group key")
    private String key;

    @Schema(description = "Group label")
    private String label;

    @Schema(description = "Related route path")
    private String routePath;

    @Schema(description = "Available permissions")
    private List<RolePermissionOptionVO> permissions;
}
