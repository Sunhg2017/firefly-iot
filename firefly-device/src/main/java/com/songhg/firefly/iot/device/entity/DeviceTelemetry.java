package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("device_telemetry")
public class DeviceTelemetry {

    private LocalDateTime ts;
    private Long tenantId;
    private Long deviceId;
    private Long productId;
    private String property;
    private Double valueNumber;
    private String valueString;
    private Boolean valueBool;
    private String rawPayload;
}
