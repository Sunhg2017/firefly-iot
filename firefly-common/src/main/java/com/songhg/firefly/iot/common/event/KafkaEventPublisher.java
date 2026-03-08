package com.songhg.firefly.iot.common.event;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

/**
 * 基于 Kafka 的领域事件发布器。
 * 事件序列化为 JSON，使用 eventId 作为 Kafka Header，tenantId 作为默认分区键。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class KafkaEventPublisher implements EventPublisher {

    private final ObjectProvider<KafkaTemplate<String, String>> kafkaTemplateProvider;
    private final ObjectMapper objectMapper;

    @Override
    public void publish(String topic, DomainEvent event) {
        String key = event.getTenantId() != null ? String.valueOf(event.getTenantId()) : event.getEventId();
        publish(topic, key, event);
    }

    @Override
    public void publish(String topic, String key, DomainEvent event) {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplateProvider.getIfAvailable();
        if (kafkaTemplate == null) {
            log.warn("Skip publishing event because KafkaTemplate is unavailable: topic={}, type={}, id={}",
                    topic, event.getEventType(), event.getEventId());
            return;
        }

        String payload;
        try {
            payload = objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize event: type={}, id={}", event.getEventType(), event.getEventId(), e);
            return;
        }

        CompletableFuture<SendResult<String, String>> future = kafkaTemplate.send(topic, key, payload);

        future.whenComplete((result, ex) -> {
            if (ex != null) {
                log.error("Failed to publish event: topic={}, type={}, id={}",
                        topic, event.getEventType(), event.getEventId(), ex);
            } else {
                log.debug("Event published: topic={}, partition={}, offset={}, type={}, id={}",
                        topic,
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset(),
                        event.getEventType(),
                        event.getEventId());
            }
        });
    }
}
