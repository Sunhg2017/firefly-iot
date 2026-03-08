package com.songhg.firefly.iot.system.dto.role;

import com.songhg.firefly.iot.common.enums.DataScopeType;
import com.songhg.firefly.iot.common.enums.RoleStatus;
import com.songhg.firefly.iot.common.mybatis.DataScopeConfig;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

/**
 * Role update request.
 */
@Data
@Schema(description = "Role update request")
public class RoleUpdateDTO {

    @Schema(description = "Role name")
    private String name;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Data scope type")
    private DataScopeType dataScope;

    @Schema(description = "Data scope config")
    private DataScopeConfig dataScopeConfig;

    @Schema(description = "Status")
    private RoleStatus status;

    @Schema(description = "Permission codes")
    private List<String> permissions;
}
