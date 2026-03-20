package com.songhg.firefly.iot.system.dto.apikey;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Schema(description = "AppKey update request")
public class ApiKeyUpdateDTO {

    @Schema(description = "AppKey name")
    @NotBlank(message = "appKey name is required")
    @Size(max = 128)
    private String name;

    @Schema(description = "Description")
    private String description;

    @NotEmpty(message = "please select at least one subscribed OpenAPI")
    @Schema(description = "Granted OpenAPI codes")
    private List<String> openApiCodes;

    @Schema(description = "Per-appKey minute limit")
    private Integer rateLimitPerMin;

    @Schema(description = "Per-appKey day limit")
    private Integer rateLimitPerDay;

    @Schema(description = "Expiration time")
    private LocalDateTime expireAt;
}
