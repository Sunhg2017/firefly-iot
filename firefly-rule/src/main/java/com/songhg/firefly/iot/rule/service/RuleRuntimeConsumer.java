package com.songhg.firefly.iot.rule.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class RuleRuntimeConsumer {

    private final ObjectMapper objectMapper;
    private final RuleRuntimeService ruleRuntimeService;
    private final AlarmRuntimeService alarmRuntimeService;

    @KafkaListener(topics = KafkaTopics.RULE_ENGINE_INPUT, groupId = "firefly-rule-runtime")
    public void onMessage(String payload) {
        try {
            DeviceMessage message = objectMapper.readValue(payload, DeviceMessage.class);
            try {
                ruleRuntimeService.process(message);
            } catch (Exception ex) {
                log.error("Rule runtime execution failed: {}", ex.getMessage(), ex);
            }
            try {
                alarmRuntimeService.process(message);
            } catch (Exception ex) {
                log.error("Alarm runtime execution failed: {}", ex.getMessage(), ex);
            }
        } catch (Exception ex) {
            log.error("Failed to consume rule runtime message: {}", ex.getMessage(), ex);
        }
    }
}
