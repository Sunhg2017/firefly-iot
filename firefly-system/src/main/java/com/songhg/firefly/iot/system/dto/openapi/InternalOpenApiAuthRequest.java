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
    @Schema(description = "App secret")
    private String appSecret;

    @NotBlank
    @Schema(description = "Service code")
    private String serviceCode;

    @NotBlank
    @Schema(description = "HTTP method")
    private String httpMethod;

    @NotBlank
    @Schema(description = "Downstream path")
    private String requestPath;

    @Schema(description = "Client IP")
    private String clientIp;
}
