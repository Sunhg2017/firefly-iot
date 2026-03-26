package com.songhg.firefly.iot.common.event;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;
import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
public class VideoChannelsSyncedEvent extends DomainEvent {

    private Long deviceId;
    private List<ChannelItem> channels;

    public static VideoChannelsSyncedEvent of(Long tenantId,
                                              Long deviceId,
                                              List<ChannelItem> channels,
                                              String source) {
        VideoChannelsSyncedEvent event = new VideoChannelsSyncedEvent();
        event.setTenantId(tenantId);
        event.setDeviceId(deviceId);
        event.setChannels(channels);
        event.setSource(source);
        return event;
    }

    @Data
    public static class ChannelItem {
        private String channelId;
        private String name;
        private String manufacturer;
        private String model;
        private String status;
        private Integer ptzType;
        private Integer subCount;
        private Double longitude;
        private Double latitude;
        private LocalDateTime occurredAt;
    }
}
