package com.songhg.firefly.iot.device.dto.device;

import com.songhg.firefly.iot.common.enums.DeviceStatus;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import com.songhg.firefly.iot.device.dto.devicetag.DeviceTagVO;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Device detail view object.
 */
@Data
@Schema(description = "Device detail view object")
public class DeviceVO {

    @Schema(description = "Device ID")
    private Long id;

    @Schema(description = "Product ID")
    private Long productId;

    @Schema(description = "Project ID")
    private Long projectId;

    @Schema(description = "Device name (unique within product)", example = "temp_sensor_01")
    private String deviceName;

    @Schema(description = "Display nickname")
    private String nickname;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Device status (ENABLED / DISABLED)")
    private DeviceStatus status;

    @Schema(description = "Online status (ONLINE / OFFLINE)")
    private OnlineStatus onlineStatus;

    @Schema(description = "Current firmware version", example = "1.0.0")
    private String firmwareVersion;

    @Schema(description = "Last known IP address", example = "192.168.1.100")
    private String ipAddress;

    @Schema(description = "Tags (comma-separated)")
    private String tags;

    @Schema(description = "Structured device tags")
    private List<DeviceTagVO> tagList;

    @Schema(description = "Gateway device ID (for sub-devices)")
    private Long gatewayId;

    @Schema(description = "Last online timestamp")
    private LocalDateTime lastOnlineAt;

    @Schema(description = "First activation timestamp")
    private LocalDateTime activatedAt;

    @Schema(description = "Creator user ID")
    private Long createdBy;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;

    @Schema(description = "Last update time")
    private LocalDateTime updatedAt;
}
