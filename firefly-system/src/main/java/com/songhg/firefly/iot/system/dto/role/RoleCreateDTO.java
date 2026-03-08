package com.songhg.firefly.iot.system.dto.role;

import com.songhg.firefly.iot.common.enums.DataScopeType;
import com.songhg.firefly.iot.common.mybatis.DataScopeConfig;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * Role creation request.
 */
@Data
@Schema(description = "Role creation request")
public class RoleCreateDTO {

    @Schema(description = "Role name", example = "Device Admin")
    @NotBlank(message = "角色名称不能为空")
    @Size(max = 128)
    private String name;

    @Schema(description = "Role code", example = "device_admin")
    @NotBlank(message = "角色代码不能为空")
    @Size(max = 64)
    private String code;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Data scope type")
    private DataScopeType dataScope;

    @Schema(description = "Data scope config")
    private DataScopeConfig dataScopeConfig;

    @Schema(description = "Permission codes")
    private List<String> permissions;
}
