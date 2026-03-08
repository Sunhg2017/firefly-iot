package com.songhg.firefly.iot.device.dto.firmware;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Device firmware binding/upgrade view object.
 */
@Data
@Schema(description = "Device firmware binding/upgrade info")
public class DeviceFirmwareVO {

    @Schema(description = "Record ID")
    private Long id;

    @Schema(description = "Device ID")
    private Long deviceId;

    @Schema(description = "Firmware ID")
    private Long firmwareId;

    @Schema(description = "Current firmware version", example = "1.0.0")
    private String currentVersion;

    @Schema(description = "Target firmware version", example = "1.2.0")
    private String targetVersion;

    @Schema(description = "Upgrade status")
    private String upgradeStatus;

    @Schema(description = "Upgrade progress (0-100)")
    private Integer upgradeProgress;

    @Schema(description = "Last upgrade time")
    private LocalDateTime lastUpgradeAt;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;

    @Schema(description = "Last update time")
    private LocalDateTime updatedAt;
}
