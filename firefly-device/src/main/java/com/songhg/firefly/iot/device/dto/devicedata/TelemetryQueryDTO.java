package com.songhg.firefly.iot.device.dto.devicedata;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Telemetry time-series data query request.
 */
@Data
@Schema(description = "遥测时序查询")
public class TelemetryQueryDTO {

    @Schema(description = "设备编号", example = "1")
    @NotNull(message = "设备ID不能为空")
    private Long deviceId;

    /** Property key to query (null = all) */
    @Schema(description = "属性标识", example = "temperature")
    private String property;

    /** Start time (ISO 8601) */
    @Schema(description = "开始时间", example = "2024-01-01T00:00:00")
    private String startTime;

    /** End time (ISO 8601) */
    @Schema(description = "结束时间", example = "2024-01-02T00:00:00")
    private String endTime;

    /** Max records to return */
    @Schema(description = "最大记录数", example = "100")
    private Integer limit;
}
