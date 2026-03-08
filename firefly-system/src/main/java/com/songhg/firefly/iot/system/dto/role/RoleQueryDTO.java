package com.songhg.firefly.iot.system.dto.role;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.RoleStatus;
import com.songhg.firefly.iot.common.enums.RoleType;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Role paginated query.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "Role paginated query")
public class RoleQueryDTO extends PageQuery {

    @Schema(description = "Search keyword")
    private String keyword;

    @Schema(description = "Role type filter")
    private RoleType type;

    @Schema(description = "Status filter")
    private RoleStatus status;
}
