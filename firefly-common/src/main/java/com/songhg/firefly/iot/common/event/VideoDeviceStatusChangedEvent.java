package com.songhg.firefly.iot.common.event;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
public class VideoDeviceStatusChangedEvent extends DomainEvent {

    private Long deviceId;
    private String status;
    private LocalDateTime statusChangedAt;

    public static VideoDeviceStatusChangedEvent of(Long tenantId,
                                                   Long deviceId,
                                                   String status,
                                                   LocalDateTime statusChangedAt,
                                                   String source) {
        VideoDeviceStatusChangedEvent event = new VideoDeviceStatusChangedEvent();
        event.setTenantId(tenantId);
        event.setDeviceId(deviceId);
        event.setStatus(status);
        event.setStatusChangedAt(statusChangedAt);
        event.setSource(source);
        return event;
    }
}
