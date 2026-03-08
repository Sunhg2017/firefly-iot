package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.EventLevel;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("device_events")
public class DeviceEvent {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private Long deviceId;
    private Long productId;
    private String eventType;
    private String eventName;
    private EventLevel level;
    private String payload;
    private LocalDateTime occurredAt;
    private LocalDateTime createdAt;
}
