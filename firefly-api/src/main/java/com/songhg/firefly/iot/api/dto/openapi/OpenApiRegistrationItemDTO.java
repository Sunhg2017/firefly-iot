package com.songhg.firefly.iot.api.dto.openapi;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class OpenApiRegistrationItemDTO {

    @NotBlank
    @Size(max = 128)
    private String code;

    @NotBlank
    @Size(max = 128)
    private String name;

    @NotBlank
    @Size(max = 16)
    private String httpMethod;

    @NotBlank
    @Size(max = 255)
    private String pathPattern;

    @NotBlank
    @Size(max = 128)
    private String permissionCode;

    private Boolean enabled;

    private Integer sortOrder;

    private String description;
}
