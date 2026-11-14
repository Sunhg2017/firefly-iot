package com.songhg.firefly.iot.device.dto.remoteconfig;

import com.songhg.firefly.iot.common.enums.RemoteConfigStatus;
import com.songhg.firefly.iot.common.enums.RemoteConfigTargetType;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "远程配置")
public class RemoteConfigVO {

    private Long id;
    private Long projectId;
    private String name;
    private String description;
    private RemoteConfigTargetType targetType;
    private Long targetId;
    private String configJson;
    private Integer version;
    private RemoteConfigStatus status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
