package com.songhg.firefly.iot.device.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceMessageProducer {

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    /**
     * 发布设备上行消息到统一入口 topic
     */
    public void publishUpstream(DeviceMessage message) {
        if (message.getMessageId() == null) {
            message.setMessageId(UUID.randomUUID().toString());
        }
        if (message.getTimestamp() == 0) {
            message.setTimestamp(System.currentTimeMillis());
        }
        String routeTopic = resolveUpstreamTopic(message);
        send(routeTopic, String.valueOf(message.getDeviceId()), message);
    }

    /**
     * 发布内部转发消息到指定 topic。
     * 这里不能复用 publishUpstream 的按消息类型路由，否则像 EVENT_REPORT 这样的消息
     * 在转发给规则引擎时会被重新投回 device.event.report，造成消费者自循环。
     */
    public void publishToTopic(String topic, DeviceMessage message) {
        if (message.getMessageId() == null) {
            message.setMessageId(UUID.randomUUID().toString());
        }
        if (message.getTimestamp() == 0) {
            message.setTimestamp(System.currentTimeMillis());
        }
        send(topic, String.valueOf(message.getDeviceId()), message);
    }

    /**
     * 发布下行消息（云端→设备）
     */
    public void publishDownstream(DeviceMessage message) {
        if (message.getMessageId() == null) {
            message.setMessageId(UUID.randomUUID().toString());
        }
        message.setTimestamp(System.currentTimeMillis());
        send(KafkaTopics.DEVICE_MESSAGE_DOWN, String.valueOf(message.getDeviceId()), message);
    }

    /**
     * 根据消息类型路由到具体 topic
     */
    private String resolveUpstreamTopic(DeviceMessage message) {
        if (message.getType() == null) return KafkaTopics.DEVICE_MESSAGE_UP;
        return switch (message.getType()) {
            case PROPERTY_REPORT -> KafkaTopics.DEVICE_PROPERTY_REPORT;
            case EVENT_REPORT -> KafkaTopics.DEVICE_EVENT_REPORT;
            case DEVICE_ONLINE, DEVICE_OFFLINE -> KafkaTopics.DEVICE_LIFECYCLE;
            case SERVICE_REPLY, PROPERTY_SET_REPLY -> KafkaTopics.DEVICE_MESSAGE_UP;
            case OTA_PROGRESS -> KafkaTopics.DEVICE_OTA_PROGRESS;
            default -> KafkaTopics.DEVICE_MESSAGE_UP;
        };
    }

    private void send(String topic, String key, DeviceMessage message) {
        try {
            String json = objectMapper.writeValueAsString(message);
            kafkaTemplate.send(topic, key, json).whenComplete((result, ex) -> {
                if (ex != null) {
                    log.error("Failed to send message to topic={}, deviceId={}: {}", topic, message.getDeviceId(), ex.getMessage());
                } else {
                    log.debug("Message sent: topic={}, partition={}, offset={}, deviceId={}",
                            topic, result.getRecordMetadata().partition(), result.getRecordMetadata().offset(), message.getDeviceId());
                }
            });
        } catch (Exception e) {
            log.error("Failed to serialize device message: {}", e.getMessage(), e);
        }
    }
}
