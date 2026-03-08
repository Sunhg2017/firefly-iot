package com.songhg.firefly.iot.rule.dto.share;

import com.songhg.firefly.iot.common.enums.ShareStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Share policy view object.
 */
@Data
@Schema(description = "Share policy view object")
public class SharePolicyVO {

    @Schema(description = "Policy ID")
    private Long id;

    @Schema(description = "Owner tenant ID")
    private Long ownerTenantId;

    @Schema(description = "Consumer tenant ID")
    private Long consumerTenantId;

    @Schema(description = "Policy name")
    private String name;

    @Schema(description = "Scope (JSON)")
    private String scope;

    @Schema(description = "Data permissions (JSON)")
    private String dataPermissions;

    @Schema(description = "Data masking rules (JSON)")
    private String maskingRules;

    @Schema(description = "Rate limit config")
    private String rateLimit;

    @Schema(description = "Validity period")
    private String validity;

    @Schema(description = "Status")
    private ShareStatus status;

    @Schema(description = "Audit enabled flag")
    private Boolean auditEnabled;

    @Schema(description = "Creator user ID")
    private Long createdBy;

    @Schema(description = "Approver user ID")
    private Long approvedBy;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;

    @Schema(description = "Last update time")
    private LocalDateTime updatedAt;
}
