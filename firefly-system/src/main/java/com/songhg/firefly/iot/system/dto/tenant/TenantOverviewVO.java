package com.songhg.firefly.iot.system.dto.tenant;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * Tenant overview statistics.
 */
@Data
@Schema(description = "Tenant overview statistics")
public class TenantOverviewVO {

    @Schema(description = "Total tenants")
    private Long totalTenants;

    @Schema(description = "Active tenants")
    private Long activeTenants;

    @Schema(description = "Suspended tenants")
    private Long suspendedTenants;

    @Schema(description = "Free plan tenants")
    private Long freeTenants;

    @Schema(description = "Standard plan tenants")
    private Long standardTenants;

    @Schema(description = "Enterprise plan tenants")
    private Long enterpriseTenants;
}
