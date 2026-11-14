package com.songhg.firefly.iot.api.dto;

import com.songhg.firefly.iot.common.enums.EventLevel;
import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 跨服务共享设备事件视图。只暴露消费方需要的业务字段，不包含租户/设备内部编号之外的配置。
 */
@Data
public class SharedDeviceEventDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String eventType;
    private String eventName;
    private EventLevel level;
    private String payload;
    private LocalDateTime occurredAt;
}
