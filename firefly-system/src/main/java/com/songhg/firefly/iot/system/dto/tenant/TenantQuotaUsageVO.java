package com.songhg.firefly.iot.system.dto.tenant;

import com.songhg.firefly.iot.common.enums.TenantPlan;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * Tenant quota and usage combined view.
 */
@Data
@Schema(description = "Tenant quota and usage combined view")
public class TenantQuotaUsageVO {

    @Schema(description = "Subscription plan")
    private TenantPlan plan;

    @Schema(description = "Quota limits")
    private TenantQuotaVO quotas;

    @Schema(description = "Current usage")
    private TenantUsageVO usage;
}
