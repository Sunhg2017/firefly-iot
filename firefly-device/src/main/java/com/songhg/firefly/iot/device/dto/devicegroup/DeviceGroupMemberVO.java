package com.songhg.firefly.iot.device.dto.devicegroup;

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

    @Schema(description = "Join time")
    private LocalDateTime createdAt;
}
