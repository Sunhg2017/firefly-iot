package com.songhg.firefly.iot.device.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.event.EventTopics;
import com.songhg.firefly.iot.common.event.VideoChannelsSyncedEvent;
import com.songhg.firefly.iot.common.event.VideoDeviceInfoSyncedEvent;
import com.songhg.firefly.iot.common.event.VideoDeviceStatusChangedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceVideoRuntimeConsumer {

    private final ObjectMapper objectMapper;
    private final DeviceVideoService deviceVideoService;

    @KafkaListener(topics = EventTopics.VIDEO_DEVICE_STATUS_CHANGED, groupId = "firefly-device-video-status")
    public void onStatusChanged(String payload) {
        consume(payload, VideoDeviceStatusChangedEvent.class, deviceVideoService::applyRuntimeStatus);
    }

    @KafkaListener(topics = EventTopics.VIDEO_DEVICE_INFO_SYNCED, groupId = "firefly-device-video-info")
    public void onDeviceInfo(String payload) {
        consume(payload, VideoDeviceInfoSyncedEvent.class, deviceVideoService::applyDeviceInfo);
    }

    @KafkaListener(topics = EventTopics.VIDEO_CHANNELS_SYNCED, groupId = "firefly-device-video-channels")
    public void onChannels(String payload) {
        consume(payload, VideoChannelsSyncedEvent.class, deviceVideoService::applyChannels);
    }

    private <T> void consume(String payload, Class<T> type, java.util.function.Consumer<T> consumer) {
        try {
            consumer.accept(objectMapper.readValue(payload, type));
        } catch (Exception ex) {
            log.error("Failed to consume video runtime event: type={}, error={}", type.getSimpleName(), ex.getMessage(), ex);
        }
    }
}
