package com.songhg.firefly.iot.device.dto.devicelog;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Device log view object.
 */
@Data
@Schema(description = "Device log view object")
public class DeviceLogVO {

    @Schema(description = "Log ID")
    private Long id;

    @Schema(description = "Device name")
    private String deviceName;

    @Schema(description = "Device nickname")
    private String nickname;

    @Schema(description = "Device ID")
    private Long deviceId;

    @Schema(description = "Product key")
    private String productKey;

    @Schema(description = "Product name")
    private String productName;

    @Schema(description = "Product ID")
    private Long productId;

    @Schema(description = "Log level")
    private String level;

    @Schema(description = "Module name")
    private String module;

    @Schema(description = "Log content")
    private String content;

    @Schema(description = "Trace ID")
    private String traceId;

    @Schema(description = "Device IP")
    private String ip;

    @Schema(description = "Device-side reported time")
    private LocalDateTime reportedAt;

    @Schema(description = "Server creation time")
    private LocalDateTime createdAt;
}
