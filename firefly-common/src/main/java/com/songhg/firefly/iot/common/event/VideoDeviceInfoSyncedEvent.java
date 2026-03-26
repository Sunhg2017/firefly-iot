package com.songhg.firefly.iot.common.event;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class VideoDeviceInfoSyncedEvent extends DomainEvent {

    private Long deviceId;
    private String manufacturer;
    private String model;
    private String firmware;

    public static VideoDeviceInfoSyncedEvent of(Long tenantId,
                                                Long deviceId,
                                                String manufacturer,
                                                String model,
                                                String firmware,
                                                String source) {
        VideoDeviceInfoSyncedEvent event = new VideoDeviceInfoSyncedEvent();
        event.setTenantId(tenantId);
        event.setDeviceId(deviceId);
        event.setManufacturer(manufacturer);
        event.setModel(model);
        event.setFirmware(firmware);
        event.setSource(source);
        return event;
    }
}
