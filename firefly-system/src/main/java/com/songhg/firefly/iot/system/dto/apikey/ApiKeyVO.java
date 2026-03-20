package com.songhg.firefly.iot.system.dto.apikey;

import com.songhg.firefly.iot.common.enums.ApiKeyStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Schema(description = "AppKey view object")
public class ApiKeyVO {

    @Schema(description = "AppKey ID")
    private Long id;

    @Schema(description = "AppKey name")
    private String name;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Access key")
    private String accessKey;

    @Schema(description = "Granted OpenAPI codes")
    private List<String> openApiCodes;

    @Schema(description = "Per-appKey minute limit")
    private Integer rateLimitPerMin;

    @Schema(description = "Per-appKey day limit")
    private Integer rateLimitPerDay;

    @Schema(description = "Status")
    private ApiKeyStatus status;

    @Schema(description = "Expiration time")
    private LocalDateTime expireAt;

    @Schema(description = "Last used time")
    private LocalDateTime lastUsedAt;

    @Schema(description = "Created time")
    private LocalDateTime createdAt;
}
