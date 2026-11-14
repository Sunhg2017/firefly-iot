package com.songhg.firefly.iot.device.dto.remoteconfig;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "远程配置版本")
public class RemoteConfigVersionVO {

    private Integer version;
    private String configJson;
    private Long createdBy;
    private LocalDateTime createdAt;
}
