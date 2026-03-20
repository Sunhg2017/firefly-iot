package com.songhg.firefly.iot.system.dto.apikey;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * API access log view object.
 */
@Data
@Schema(description = "API access log view object")
public class ApiAccessLogVO {

    @Schema(description = "Log ID")
    private Long id;

    @Schema(description = "API key ID")
    private Long apiKeyId;

    @Schema(description = "HTTP method")
    private String method;

    @Schema(description = "Request path")
    private String path;

    @Schema(description = "Matched OpenAPI code")
    private String openApiCode;

    @Schema(description = "HTTP status code")
    private Integer statusCode;

    @Schema(description = "Latency in ms")
    private Integer latencyMs;

    @Schema(description = "Client IP")
    private String clientIp;

    @Schema(description = "Request body size in bytes")
    private Integer requestSize;

    @Schema(description = "Response body size in bytes")
    private Integer responseSize;

    @Schema(description = "Error message")
    private String errorMessage;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;
}
