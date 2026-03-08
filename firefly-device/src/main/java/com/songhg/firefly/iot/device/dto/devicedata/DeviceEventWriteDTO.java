package com.songhg.firefly.iot.device.dto.devicedata;

import com.songhg.firefly.iot.common.enums.EventLevel;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.Map;

/**
 * Device event report request.
 */
@Data
@Schema(description = "设备事件上报请求")
public class DeviceEventWriteDTO {

    @Schema(description = "事件类型标识", example = "alarm")
    @NotBlank(message = "事件类型不能为空")
    private String eventType;

    @Schema(description = "事件名称", example = "高温告警")
    private String eventName;

    @Schema(description = "事件级别")
    private EventLevel level;

    @Schema(description = "事件数据")
    private Map<String, Object> payload;
}
