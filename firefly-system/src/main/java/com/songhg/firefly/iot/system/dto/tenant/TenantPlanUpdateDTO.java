package com.songhg.firefly.iot.system.dto.tenant;

import com.songhg.firefly.iot.common.enums.TenantPlan;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Tenant plan update request.
 */
@Data
@Schema(description = "Tenant plan update request")
public class TenantPlanUpdateDTO {

    @Schema(description = "Subscription plan")
    @NotNull(message = "套餐不能为空")
    private TenantPlan plan;
}
