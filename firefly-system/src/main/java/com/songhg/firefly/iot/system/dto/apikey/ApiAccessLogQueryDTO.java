package com.songhg.firefly.iot.system.dto.apikey;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * API access log paginated query.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "API access log paginated query")
public class ApiAccessLogQueryDTO extends PageQuery {

    @Schema(description = "Start time filter")
    private LocalDateTime startTime;

    @Schema(description = "End time filter")
    private LocalDateTime endTime;

    @Schema(description = "HTTP method filter")
    private String method;

    @Schema(description = "Request path filter")
    private String path;

    @Schema(description = "HTTP status code filter")
    private Integer statusCode;
}
