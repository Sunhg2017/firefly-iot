package com.songhg.firefly.iot.system.dto.openapi;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "Internal gateway OpenAPI auth response")
public class InternalOpenApiAuthVO {

    @Schema(description = "Tenant ID")
    private Long tenantId;

    @Schema(description = "AppKey ID")
    private Long appKeyId;

    @Schema(description = "OpenAPI code")
    private String openApiCode;

    @Schema(description = "Granted permission code")
    private String permissionCode;

    @Schema(description = "Per-appKey minute limit")
    private Integer rateLimitPerMin;

    @Schema(description = "Per-appKey daily limit")
    private Integer rateLimitPerDay;

    @Schema(description = "Per-tenant subscription concurrency limit")
    private Integer concurrencyLimit;

    @Schema(description = "Per-tenant subscription daily limit")
    private Long subscriptionDailyLimit;
}
