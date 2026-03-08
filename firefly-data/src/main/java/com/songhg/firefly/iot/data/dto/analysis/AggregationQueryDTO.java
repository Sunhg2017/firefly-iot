package com.songhg.firefly.iot.data.dto.analysis;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

/**
 * Aggregation query request.
 */
@Data
@Schema(description = "聚合查询请求")
public class AggregationQueryDTO {

    @Schema(description = "设备编号列表")
    @NotNull(message = "设备ID不能为空")
    private List<Long> deviceIds;

    @Schema(description = "属性名称", example = "temperature")
    @NotBlank(message = "属性名不能为空")
    private String property;

    @Schema(description = "开始时间")
    private String startTime;

    @Schema(description = "结束时间")
    private String endTime;

    @Schema(description = "聚合间隔", example = "1h")
    @NotBlank(message = "聚合间隔不能为空")
    private String interval;

    @Schema(description = "聚合函数", example = "AVG")
    private String aggregation = "AVG";
}
