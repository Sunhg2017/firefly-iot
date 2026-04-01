package com.songhg.firefly.iot.device.dto.devicedata;

import com.songhg.firefly.iot.common.enums.EventLevel;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Device event view object.
 */
@Data
@Schema(description = "Device event view object")
public class DeviceEventVO {

    @Schema(description = "Event ID")
    private Long id;

    @Schema(description = "Device ID")
    private Long deviceId;

    @Schema(description = "Device name")
    private String deviceName;

    @Schema(description = "Product ID")
    private Long productId;

    @Schema(description = "Event type identifier", example = "alarm")
    private String eventType;

    @Schema(description = "Human-readable event name")
    private String eventName;

    @Schema(description = "Event level")
    private EventLevel level;

    @Schema(description = "Event payload (JSON string)")
    private String payload;

    @Schema(description = "Event occurrence time")
    private LocalDateTime occurredAt;

    @Schema(description = "Record creation time")
    private LocalDateTime createdAt;
}
