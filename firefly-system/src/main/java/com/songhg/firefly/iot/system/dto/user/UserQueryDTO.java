package com.songhg.firefly.iot.system.dto.user;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.UserStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * User paginated query.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "User paginated query")
public class UserQueryDTO extends PageQuery {

    @Schema(description = "Search keyword")
    private String keyword;

    @Schema(description = "Status filter")
    private UserStatus status;

    @Schema(description = "Role ID filter")
    private Long roleId;
}
