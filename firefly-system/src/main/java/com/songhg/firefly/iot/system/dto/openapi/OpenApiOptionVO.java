package com.songhg.firefly.iot.system.dto.openapi;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "OpenAPI option")
public class OpenApiOptionVO {

    @Schema(description = "OpenAPI code")
    private String code;

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
}
