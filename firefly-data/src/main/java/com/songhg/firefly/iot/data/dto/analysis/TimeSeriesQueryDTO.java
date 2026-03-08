package com.songhg.firefly.iot.data.dto.analysis;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

/**
 * 时序数据查询请求
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "时序数据分页查询请求")
public class TimeSeriesQueryDTO extends PageQuery {

    @Schema(description = "设备编号")
    @NotNull(message = "设备ID不能为空")
    private Long deviceId;

    @Schema(description = "属性名列表")
    private List<String> properties;

    @Schema(description = "开始时间")
    private String startTime;

    @Schema(description = "结束时间")
    private String endTime;

    @Schema(description = "聚合间隔", example = "1h")
    private String interval;

    @Schema(description = "聚合函数")
    private String aggregation;

}
