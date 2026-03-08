package com.songhg.firefly.iot.device.dto.devicedata;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Telemetry aggregation (time-bucket) query request.
 */
@Data
@Schema(description = "遥测聚合查询")
public class TelemetryAggregateDTO {

    @Schema(description = "设备编号", example = "1")
    @NotNull(message = "设备ID不能为空")
    private Long deviceId;

    /** Property key to aggregate */
    @Schema(description = "属性标识", example = "temperature")
    @NotBlank(message = "属性不能为空")
    private String property;

    @Schema(description = "开始时间", example = "2024-01-01T00:00:00")
    private String startTime;

    @Schema(description = "结束时间", example = "2024-01-02T00:00:00")
    private String endTime;

    /** Time bucket interval (e.g. 1h, 5m, 1d) */
    @Schema(description = "时间桶间隔", example = "1h")
    @NotBlank(message = "时间桶不能为空")
    private String interval;
}
