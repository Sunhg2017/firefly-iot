package com.songhg.firefly.iot.system.dto.openapi;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
@Schema(description = "OpenAPI create request")
public class OpenApiCreateDTO {

    @Schema(description = "OpenAPI code")
    @NotBlank
    @Size(max = 128)
    private String code;

    @Schema(description = "OpenAPI name")
    @NotBlank
    @Size(max = 128)
    private String name;

    @Schema(description = "Service code")
    @NotBlank
    @Size(max = 32)
    private String serviceCode;

    @Schema(description = "HTTP method")
    @NotBlank
    @Size(max = 16)
    private String httpMethod;

    @Schema(description = "Downstream path pattern")
    @NotBlank
    @Size(max = 255)
    private String pathPattern;

    @Schema(description = "Granted permission code")
    @Size(max = 128)
    private String permissionCode;

    @Schema(description = "Whether enabled")
    @NotNull
    private Boolean enabled;

    @Schema(description = "Sort order")
    private Integer sortOrder;

    @Schema(description = "Description")
    private String description;
}
