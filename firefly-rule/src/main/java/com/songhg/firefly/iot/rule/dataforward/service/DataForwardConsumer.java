package com.songhg.firefly.iot.rule.dataforward.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * 数据流转消息消费者：独立消费组消费归一化设备消息，触发数据流转规则运行时。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataForwardConsumer {

    private final ObjectMapper objectMapper;
    private final DataForwardRuntimeService runtimeService;

    @KafkaListener(topics = KafkaTopics.RULE_ENGINE_INPUT, groupId = "firefly-data-forward")
    public void onMessage(String payload) {
        try {
            DeviceMessage message = objectMapper.readValue(payload, DeviceMessage.class);
            runtimeService.process(message);
        } catch (Exception ex) {
            log.error("Failed to consume data forward message: {}", ex.getMessage(), ex);
        }
    }
}
