package com.songhg.firefly.iot.device.dto.remoteconfig;

import com.songhg.firefly.iot.common.enums.RemoteConfigAssignmentStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "远程配置下发记录")
public class RemoteConfigAssignmentVO {

    private Long id;
    private Long configId;
    private Integer configVersion;
    private Long deviceId;
    private String deviceName;
    private RemoteConfigAssignmentStatus status;
    private String messageId;
    private String errorMessage;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
