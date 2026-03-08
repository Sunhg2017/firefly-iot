package com.songhg.firefly.iot.device.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceMessageConsumer {

    private final ObjectMapper objectMapper;
    private final MessageRouterService routerService;

    @KafkaListener(topics = KafkaTopics.DEVICE_PROPERTY_REPORT, groupId = "firefly-property-consumer")
    public void onPropertyReport(String payload) {
        processMessage(payload, "PROPERTY_REPORT");
    }

    @KafkaListener(topics = KafkaTopics.DEVICE_EVENT_REPORT, groupId = "firefly-event-consumer")
    public void onEventReport(String payload) {
        processMessage(payload, "EVENT_REPORT");
    }

    @KafkaListener(topics = KafkaTopics.DEVICE_LIFECYCLE, groupId = "firefly-lifecycle-consumer")
    public void onLifecycle(String payload) {
        processMessage(payload, "LIFECYCLE");
    }

    @KafkaListener(topics = KafkaTopics.DEVICE_MESSAGE_UP, groupId = "firefly-upstream-consumer")
    public void onUpstream(String payload) {
        processMessage(payload, "UPSTREAM");
    }

    @KafkaListener(topics = KafkaTopics.DEVICE_OTA_PROGRESS, groupId = "firefly-ota-consumer")
    public void onOtaProgress(String payload) {
        processMessage(payload, "OTA_PROGRESS");
    }

    private void processMessage(String payload, String source) {
        try {
            DeviceMessage message = objectMapper.readValue(payload, DeviceMessage.class);
            log.debug("Consumed [{}]: deviceId={}, type={}, messageId={}", source, message.getDeviceId(), message.getType(), message.getMessageId());
            routerService.routeUpstream(message);
        } catch (Exception e) {
            log.error("Failed to process message from {}: {}", source, e.getMessage(), e);
        }
    }
}
