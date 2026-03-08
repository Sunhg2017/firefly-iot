package com.songhg.firefly.iot.data.dto.apikey;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;

/**
 * API call statistics view object.
 */
@Data
@Schema(description = "接口调用统计视图对象")
public class ApiCallStatsVO {

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "总调用次数")
    private Long totalCalls;

    @Schema(description = "成功调用次数")
    private Long successCalls;

    @Schema(description = "失败调用次数")
    private Long errorCalls;

    @Schema(description = "平均时延毫秒数")
    private Integer avgLatencyMs;

    @Schema(description = "最大时延毫秒数")
    private Integer maxLatencyMs;

    @Schema(description = "百分位99时延毫秒数")
    private Integer p99LatencyMs;
}
