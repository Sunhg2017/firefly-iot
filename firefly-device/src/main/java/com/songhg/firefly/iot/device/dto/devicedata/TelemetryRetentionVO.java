package com.songhg.firefly.iot.device.dto.devicedata;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "租户时序数据保留策略")
public class TelemetryRetentionVO {

    @Schema(description = "当前生效保留天数", example = "90")
    private Integer retentionDays;

    @Schema(description = "全局默认保留天数", example = "90")
    private Integer defaultRetentionDays;

    @Schema(description = "全局最大可设置保留天数", example = "365")
    private Integer globalMaxRetentionDays;

    @Schema(description = "是否使用全局默认值（未单独配置）", example = "true")
    private Boolean usingDefault;
}
