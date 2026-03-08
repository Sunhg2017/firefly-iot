package com.songhg.firefly.iot.data.dto.apikey;

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
@Schema(description = "接口访问日志分页查询")
public class ApiAccessLogQueryDTO extends PageQuery {

    @Schema(description = "开始时间筛选")
    private LocalDateTime startTime;

    @Schema(description = "结束时间筛选")
    private LocalDateTime endTime;

    @Schema(description = "请求方法筛选")
    private String method;

    @Schema(description = "请求路径筛选")
    private String path;

    @Schema(description = "状态码筛选")
    private Integer statusCode;
}
