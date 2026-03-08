package com.songhg.firefly.iot.rule.dto.share;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Share policy creation request.
 */
@Data
@Schema(description = "共享策略创建请求")
public class SharePolicyCreateDTO {

    @Schema(description = "策略名称")
    @NotBlank(message = "策略名称不能为空")
    private String name;

    @Schema(description = "消费方租户编号")
    @NotNull(message = "消费方租户ID不能为空")
    private Long consumerTenantId;

    @Schema(description = "共享范围")
    private String scope;

    @Schema(description = "数据权限")
    private String dataPermissions;

    @Schema(description = "数据脱敏规则")
    private String maskingRules;

    @Schema(description = "限流配置")
    private String rateLimit;

    @Schema(description = "有效期")
    private String validity;

    @Schema(description = "是否启用审计")
    private Boolean auditEnabled = true;
}
