package com.songhg.firefly.iot.rule.dto.share;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Share audit log view object.
 */
@Data
@Schema(description = "Share audit log view object")
public class ShareAuditLogVO {

    @Schema(description = "Log ID")
    private Long id;

    @Schema(description = "Policy ID")
    private Long policyId;

    @Schema(description = "Consumer tenant ID")
    private Long consumerTenantId;

    @Schema(description = "Action")
    private String action;

    @Schema(description = "Query detail")
    private String queryDetail;

    @Schema(description = "Result count")
    private Integer resultCount;

    @Schema(description = "IP address")
    private String ipAddress;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;
}
