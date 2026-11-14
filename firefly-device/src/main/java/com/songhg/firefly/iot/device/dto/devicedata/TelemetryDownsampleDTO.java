package com.songhg.firefly.iot.device.dto.devicedata;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
@Schema(description = "时序数据降采样查询")
public class TelemetryDownsampleDTO {

    @Schema(description = "设备编号", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull(message = "设备编号不能为空")
    private Long deviceId;

    @Schema(description = "属性标识", example = "temperature", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotBlank(message = "属性标识不能为空")
    private String property;

    @Schema(description = "开始时间（ISO-8601）")
    private String startTime;

    @Schema(description = "结束时间（ISO-8601）")
    private String endTime;

    @Schema(description = "降采样粒度：HOUR / DAY，默认 HOUR", example = "HOUR")
    private String granularity;
}
