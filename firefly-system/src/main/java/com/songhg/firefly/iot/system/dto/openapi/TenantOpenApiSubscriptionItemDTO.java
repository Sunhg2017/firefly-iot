package com.songhg.firefly.iot.system.dto.openapi;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "Tenant OpenAPI subscription item")
public class TenantOpenApiSubscriptionItemDTO {

    @Schema(description = "OpenAPI code")
    @NotBlank
    @Size(max = 128)
    private String openApiCode;

    @Schema(description = "IP whitelist")
    private List<String> ipWhitelist;

    @Schema(description = "Concurrency limit, -1 means unlimited")
    private Integer concurrencyLimit;

    @Schema(description = "Daily limit, -1 means unlimited")
    private Long dailyLimit;
}
