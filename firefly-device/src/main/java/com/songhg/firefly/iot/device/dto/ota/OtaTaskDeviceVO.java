package com.songhg.firefly.iot.device.dto.ota;

import com.songhg.firefly.iot.common.enums.OtaDeviceStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * OTA task per-device upgrade status.
 */
@Data
@Schema(description = "OTA task per-device upgrade status")
public class OtaTaskDeviceVO {

    @Schema(description = "Record ID")
    private Long id;

    @Schema(description = "OTA task ID")
    private Long taskId;

    @Schema(description = "Device ID")
    private Long deviceId;

    @Schema(description = "Device upgrade status")
    private OtaDeviceStatus status;

    @Schema(description = "Upgrade progress (0-100)")
    private Integer progress;

    @Schema(description = "Error message (if failed)")
    private String errorMessage;

    @Schema(description = "Upgrade start time")
    private LocalDateTime startedAt;

    @Schema(description = "Upgrade finish time")
    private LocalDateTime finishedAt;

    @Schema(description = "Record creation time")
    private LocalDateTime createdAt;
}
