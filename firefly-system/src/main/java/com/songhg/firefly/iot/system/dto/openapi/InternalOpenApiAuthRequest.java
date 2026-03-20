package com.songhg.firefly.iot.system.dto.openapi;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@Schema(description = "Internal gateway OpenAPI auth request")
public class InternalOpenApiAuthRequest {

    @NotBlank
    @Schema(description = "App key")
    private String appKey;

    @NotBlank
    @Schema(description = "Request timestamp in epoch milliseconds")
    private String timestamp;

    @NotBlank
    @Schema(description = "Unique request nonce")
    private String nonce;

    @NotBlank
    @Schema(description = "HMAC-SHA256 request signature")
    private String signature;

    @NotBlank
    @Schema(description = "Service code")
    private String serviceCode;

    @NotBlank
    @Schema(description = "HTTP method")
    private String httpMethod;

    @NotBlank
    @Schema(description = "Downstream path")
    private String requestPath;

    @Schema(description = "Canonical query string sorted by key/value")
    private String canonicalQuery;

    @NotBlank
    @Schema(description = "SHA256 hex of raw request body")
    private String bodySha256;

    @Schema(description = "Client IP")
    private String clientIp;
}
