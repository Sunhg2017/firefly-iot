package com.songhg.firefly.iot.rule.dataforward.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import com.songhg.firefly.iot.common.message.PlatformEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * 事件订阅消费者：消费 {@code platform.event} 平台事件，触发事件订阅运行时。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class EventSubscriptionConsumer {

    private final ObjectMapper objectMapper;
    private final EventSubscriptionRuntimeService runtimeService;

    @KafkaListener(topics = KafkaTopics.PLATFORM_EVENT, groupId = "firefly-event-subscription")
    public void onMessage(String payload) {
        try {
            PlatformEvent event = objectMapper.readValue(payload, PlatformEvent.class);
            runtimeService.process(event);
        } catch (Exception ex) {
            log.error("Failed to consume platform event: {}", ex.getMessage(), ex);
        }
    }
}
