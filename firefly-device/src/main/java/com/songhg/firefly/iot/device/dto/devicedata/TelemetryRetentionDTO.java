package com.songhg.firefly.iot.device.dto.devicedata;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
@Schema(description = "设置租户时序数据保留天数")
public class TelemetryRetentionDTO {

    @Schema(description = "保留天数", example = "90")
    @NotNull(message = "保留天数不能为空")
    @Min(value = 1, message = "保留天数至少为 1 天")
    private Integer retentionDays;
}
