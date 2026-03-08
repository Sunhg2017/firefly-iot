package com.songhg.firefly.iot.system.dto.apikey;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * API key update request.
 */
@Data
@Schema(description = "API key update request")
public class ApiKeyUpdateDTO {

    @Schema(description = "API key name")
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
