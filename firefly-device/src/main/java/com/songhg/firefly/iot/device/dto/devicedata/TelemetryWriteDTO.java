package com.songhg.firefly.iot.device.dto.devicedata;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.Map;

/**
 * Telemetry data write request (property report).
 */
@Data
@Schema(description = "遥测数据写入")
public class TelemetryWriteDTO {

    /** Key-value property map */
    @Schema(description = "属性键值映射", example = "{\"temperature\": 25.5, \"humidity\": 60}")
    @NotEmpty(message = "属性数据不能为空")
    private Map<String, Object> properties;

    /** Optional epoch ms timestamp (default = server time) */
    @Schema(description = "时间戳")
    private Long timestamp;
}
