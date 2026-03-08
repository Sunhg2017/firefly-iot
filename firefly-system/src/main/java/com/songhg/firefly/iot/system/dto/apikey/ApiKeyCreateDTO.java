package com.songhg.firefly.iot.system.dto.apikey;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * API key creation request.
 */
@Data
@Schema(description = "API key creation request")
public class ApiKeyCreateDTO {

    @Schema(description = "API key name", example = "My Integration")
    @NotBlank(message = "API Key名称不能为空")
    @Size(max = 128)
    private String name;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Permission scopes")
    private List<String> scopes;

    @Schema(description = "Rate limit per minute")
    private Integer rateLimitPerMin;

    @Schema(description = "Rate limit per day")
    private Integer rateLimitPerDay;

    @Schema(description = "Expiration time")
    private LocalDateTime expireAt;
}
