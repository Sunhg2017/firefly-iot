package com.songhg.firefly.iot.system.consumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.event.EventTopics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Auth 模块事件消费者：消费登录事件，用于审计日志和安全告警。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AuthEventConsumer {

    private final ObjectMapper objectMapper;

    @KafkaListener(topics = EventTopics.AUTH_EVENTS, groupId = "firefly-system-audit")
    public void onAuthEvent(String message) {
        try {
            JsonNode node = objectMapper.readTree(message);
            String action = node.path("action").asText();
            Long userId = node.path("operatorId").asLong(0);
            String source = node.path("source").asText();

            log.info("[审计日志] action={}, userId={}, source={}", action, userId, source);

            switch (action) {
                case "LOGIN_SUCCESS" -> handleLoginSuccess(node);
                case "LOGIN_FAILED" -> handleLoginFailed(node);
                case "LOGOUT" -> handleLogout(node);
                case "SESSION_KICKED" -> handleSessionKicked(node);
                default -> log.debug("Unhandled auth event action: {}", action);
            }
        } catch (Exception e) {
            log.error("Failed to process auth event: {}", message, e);
        }
    }

    private void handleLoginSuccess(JsonNode node) {
        String platform = node.path("platform").asText();
        String ip = node.path("ip").asText();
        log.info("[登录成功] userId={}, platform={}, ip={}",
                node.path("operatorId").asLong(), platform, ip);
    }

    private void handleLoginFailed(JsonNode node) {
        String reason = node.path("failReason").asText();
        log.warn("[登录失败] identifier={}, reason={}, ip={}",
                node.path("identifier").asText(), reason, node.path("ip").asText());
    }

    private void handleLogout(JsonNode node) {
        log.info("[用户登出] userId={}", node.path("operatorId").asLong());
    }

    private void handleSessionKicked(JsonNode node) {
        log.info("[会话踢出] userId={}, sessionId={}",
                node.path("operatorId").asLong(), node.path("sessionId").asText());
    }
}
