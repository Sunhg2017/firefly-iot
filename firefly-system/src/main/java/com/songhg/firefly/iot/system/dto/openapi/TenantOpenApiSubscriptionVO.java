package com.songhg.firefly.iot.system.dto.openapi;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
@Schema(description = "Tenant OpenAPI subscription view object")
public class TenantOpenApiSubscriptionVO {

    @Schema(description = "OpenAPI code")
    private String openApiCode;

    @Schema(description = "OpenAPI name")
    private String name;

    @Schema(description = "Service code")
    private String serviceCode;

    @Schema(description = "HTTP method")
    private String httpMethod;

    @Schema(description = "Downstream path pattern")
    private String pathPattern;

    @Schema(description = "Gateway path preview")
    private String gatewayPath;

    @Schema(description = "Granted permission code")
    private String permissionCode;

    @Schema(description = "Whether OpenAPI is enabled")
    private Boolean enabled;

    @Schema(description = "Whether tenant subscribed")
    private Boolean subscribed;

    @Schema(description = "IP whitelist")
    private List<String> ipWhitelist = new ArrayList<>();

    @Schema(description = "Concurrency limit")
    private Integer concurrencyLimit;

    @Schema(description = "Daily limit")
    private Long dailyLimit;
}
