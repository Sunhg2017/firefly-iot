package com.songhg.firefly.iot.system.dto.openapi;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "OpenAPI view object")
public class OpenApiVO {

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

    @Schema(description = "Whether enabled")
    private Boolean enabled;

    @Schema(description = "Sort order")
    private Integer sortOrder;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Created at")
    private LocalDateTime createdAt;

    @Schema(description = "Updated at")
    private LocalDateTime updatedAt;
}
