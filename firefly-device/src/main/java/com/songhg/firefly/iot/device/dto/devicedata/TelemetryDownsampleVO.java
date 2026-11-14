package com.songhg.firefly.iot.device.dto.devicedata;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "降采样聚合结果")
public class TelemetryDownsampleVO {

    @Schema(description = "时间桶起点")
    private LocalDateTime bucket;

    @Schema(description = "平均值")
    private Double avgValue;

    @Schema(description = "最大值")
    private Double maxValue;

    @Schema(description = "最小值")
    private Double minValue;

    @Schema(description = "求和值")
    private Double sumValue;

    @Schema(description = "样本数")
    private Long sampleCount;

    @Schema(description = "桶内最后一个值")
    private Double lastValue;
}
