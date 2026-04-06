package com.songhg.firefly.iot.system.dto.tenant;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.TenantStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Tenant paginated query.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "Tenant paginated query")
public class TenantQueryDTO extends PageQuery {

    @Schema(description = "Search keyword")
    private String keyword;

    @Schema(description = "Status filter")
    private TenantStatus status;
}
