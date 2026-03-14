package com.songhg.firefly.iot.system.dto.role;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "Role permission option")
public class RolePermissionOptionVO {

    @Schema(description = "Permission code")
    private String code;

    @Schema(description = "Permission label")
    private String label;
}
