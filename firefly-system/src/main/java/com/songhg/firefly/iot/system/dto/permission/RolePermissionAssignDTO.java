package com.songhg.firefly.iot.system.dto.permission;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

/**
 * Role permission assignment request.
 */
@Data
@Schema(description = "Role permission assignment request")
public class RolePermissionAssignDTO {

    @Schema(description = "Permission code list")
    @NotNull(message = "权限编码列表不能为空")
    private List<String> permissions;
}
