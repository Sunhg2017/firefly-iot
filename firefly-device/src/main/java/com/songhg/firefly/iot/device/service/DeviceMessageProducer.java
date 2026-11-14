package com.songhg.firefly.iot.device.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import com.songhg.firefly.iot.common.metrics.Metrics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceMessageProducer {

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    /**
     * 发布设备上行消息到统一入口 topic。
     * 返回发送结果 future：需要感知失败（如规则转发）的调用方应等待该 future，
     * 其余链路可忽略返回值但失败会记录日志。
     */
    public CompletableFuture<SendResult<String, String>> publishUpstream(DeviceMessage message) {
        if (message.getMessageId() == null) {
            message.setMessageId(UUID.randomUUID().toString());
        }
        if (message.getTimestamp() == 0) {
            message.setTimestamp(System.currentTimeMillis());
        }
        String routeTopic = resolveUpstreamTopic(message);
        return send(routeTopic, String.valueOf(message.getDeviceId()), message);
    }

    /**
     * 发布内部转发消息到指定 topic。
     * 这里不能复用 publishUpstream 的按消息类型路由，否则像 EVENT_REPORT 这样的消息
     * 在转发给规则引擎时会被重新投回 device.event.report，造成消费者自循环。
     */
    public CompletableFuture<SendResult<String, String>> publishToTopic(String topic, DeviceMessage message) {
        if (message.getMessageId() == null) {
            message.setMessageId(UUID.randomUUID().toString());
        }
        if (message.getTimestamp() == 0) {
            message.setTimestamp(System.currentTimeMillis());
        }
        return send(topic, String.valueOf(message.getDeviceId()), message);
    }

    /**
     * 发布下行消息（云端→设备）
     */
    public CompletableFuture<SendResult<String, String>> publishDownstream(DeviceMessage message) {
        if (message.getMessageId() == null) {
            message.setMessageId(UUID.randomUUID().toString());
        }
        message.setTimestamp(System.currentTimeMillis());
        Metrics.increment("firefly.device.message.downstream",
                "type", message.getType() == null ? "UNKNOWN" : message.getType().name());
        return send(KafkaTopics.DEVICE_MESSAGE_DOWN, String.valueOf(message.getDeviceId()), message);
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

    /**
     * 发送并返回发送结果 future。
     * 序列化失败直接抛出；Kafka 异步发送失败会以异常 future 暴露给调用方，
     * 需要可靠投递的链路必须等待并处理该 future，不能只依赖日志。
     */
    private CompletableFuture<SendResult<String, String>> send(String topic, String key, DeviceMessage message) {
        String json;
        try {
            json = objectMapper.writeValueAsString(message);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to serialize device message: topic=" + topic, e);
        }
        CompletableFuture<SendResult<String, String>> future = kafkaTemplate.send(topic, key, json);
        future.whenComplete((result, ex) -> {
            if (ex != null) {
                log.error("Failed to send message to topic={}, deviceId={}: {}", topic, message.getDeviceId(), ex.getMessage());
            } else if (result != null) {
                log.debug("Message sent: topic={}, partition={}, offset={}, deviceId={}",
                        topic, result.getRecordMetadata().partition(), result.getRecordMetadata().offset(), message.getDeviceId());
            }
        });
        return future;
    }
}
