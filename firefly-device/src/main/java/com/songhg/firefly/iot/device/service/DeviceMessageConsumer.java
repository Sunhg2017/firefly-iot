package com.songhg.firefly.iot.device.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import com.songhg.firefly.iot.common.metrics.Metrics;
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

    /**
     * 消费失败不再吞异常：抛回监听容器，由 DefaultErrorHandler 做有限重试，
     * 重试耗尽后投递到死信 topic，保证失败可观测、可补偿。
     */
    private void processMessage(String payload, String source) {
        DeviceMessage message;
        try {
            message = objectMapper.readValue(payload, DeviceMessage.class);
        } catch (Exception ex) {
            log.error("Failed to deserialize message from {}", source, ex);
            throw new IllegalStateException("Invalid device message payload from " + source, ex);
        }

        log.debug("Consumed [{}]: deviceId={}, type={}, messageId={}",
                source, message.getDeviceId(), message.getType(), message.getMessageId());
        try {
            routerService.routeUpstream(message);
            Metrics.increment("firefly.device.message.consumed", "source", source);
        } catch (Exception ex) {
            Metrics.increment("firefly.device.message.failed", "source", source);
            log.error("Failed to process message from {}: messageId={}", source, message.getMessageId(), ex);
            throw new IllegalStateException(
                    "Device message processing failed: source=" + source + ", messageId=" + message.getMessageId(), ex);
        }
    }
}
