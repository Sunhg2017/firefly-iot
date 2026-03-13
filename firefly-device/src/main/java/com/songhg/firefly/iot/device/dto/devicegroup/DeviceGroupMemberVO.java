package com.songhg.firefly.iot.device.dto.devicegroup;

import com.songhg.firefly.iot.common.enums.DeviceStatus;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Device group membership view object.
 */
@Data
@Schema(description = "Device group membership")
public class DeviceGroupMemberVO {

    @Schema(description = "Membership record ID")
    private Long id;

    @Schema(description = "Group ID")
    private Long groupId;

    @Schema(description = "Device ID")
    private Long deviceId;

    @Schema(description = "Device name")
    private String deviceName;

    @Schema(description = "Device nickname")
    private String nickname;

    @Schema(description = "Product business key")
    private String productKey;

    @Schema(description = "Product name")
    private String productName;

    @Schema(description = "Device status")
    private DeviceStatus status;

    @Schema(description = "Online status")
    private OnlineStatus onlineStatus;

    @Schema(description = "Join time")
    private LocalDateTime createdAt;
}
