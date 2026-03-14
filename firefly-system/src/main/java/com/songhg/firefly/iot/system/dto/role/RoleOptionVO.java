package com.songhg.firefly.iot.system.dto.role;

import com.songhg.firefly.iot.common.enums.RoleStatus;
import com.songhg.firefly.iot.common.enums.RoleType;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "Role option")
public class RoleOptionVO {

    @Schema(description = "Role ID")
    private Long id;

    @Schema(description = "Role code")
    private String code;

    @Schema(description = "Role name")
    private String name;

    @Schema(description = "Role type")
    private RoleType type;

    @Schema(description = "System built-in flag")
    private Boolean systemFlag;

    @Schema(description = "Role status")
    private RoleStatus status;
}
