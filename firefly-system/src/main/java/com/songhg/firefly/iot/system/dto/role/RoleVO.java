package com.songhg.firefly.iot.system.dto.role;

import com.songhg.firefly.iot.common.enums.DataScopeType;
import com.songhg.firefly.iot.common.enums.RoleStatus;
import com.songhg.firefly.iot.common.enums.RoleType;
import com.songhg.firefly.iot.common.mybatis.DataScopeConfig;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Role view object.
 */
@Data
@Schema(description = "Role view object")
public class RoleVO {

    @Schema(description = "Role ID")
    private Long id;

    @Schema(description = "Role code")
    private String code;

    @Schema(description = "Role name")
    private String name;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Role type")
    private RoleType type;

    @Schema(description = "Data scope type")
    private DataScopeType dataScope;

    @Schema(description = "Data scope config")
    private DataScopeConfig dataScopeConfig;

    @Schema(description = "System built-in flag")
    private Boolean systemFlag;

    @Schema(description = "Status")
    private RoleStatus status;

    @Schema(description = "Permission codes")
    private List<String> permissions;

    @Schema(description = "Number of users with this role")
    private Integer userCount;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;
}
