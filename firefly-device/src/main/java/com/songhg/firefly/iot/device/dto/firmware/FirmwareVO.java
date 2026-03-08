package com.songhg.firefly.iot.device.dto.firmware;

import com.songhg.firefly.iot.common.enums.FirmwareStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Firmware view object.
 */
@Data
@Schema(description = "Firmware view object")
public class FirmwareVO {

    @Schema(description = "Firmware ID")
    private Long id;

    @Schema(description = "Product ID")
    private Long productId;

    @Schema(description = "Firmware version", example = "1.2.0")
    private String version;

    @Schema(description = "Display name")
    private String displayName;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Firmware binary URL")
    private String fileUrl;

    @Schema(description = "File size in bytes")
    private Long fileSize;

    @Schema(description = "MD5 checksum")
    private String md5Checksum;

    @Schema(description = "Firmware status")
    private FirmwareStatus status;

    @Schema(description = "Creator user ID")
    private Long createdBy;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;

    @Schema(description = "Last update time")
    private LocalDateTime updatedAt;
}
