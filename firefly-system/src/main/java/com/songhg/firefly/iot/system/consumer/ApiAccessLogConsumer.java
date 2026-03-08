package com.songhg.firefly.iot.system.consumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.event.EventTopics;
import com.songhg.firefly.iot.system.entity.ApiAccessLog;
import com.songhg.firefly.iot.system.mapper.ApiAccessLogMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * API 调用日志消费者：从 Kafka 消费 Gateway 采集的调用日志，写入数据库。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ApiAccessLogConsumer {

    private final ApiAccessLogMapper apiAccessLogMapper;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = EventTopics.API_ACCESS_LOGS, groupId = "firefly-system-api-logs")
    public void onApiAccessLog(String message) {
        try {
            JsonNode node = objectMapper.readTree(message);

            ApiAccessLog entity = new ApiAccessLog();
            entity.setApiKeyId(node.path("apiKeyId").asLong(0));
            entity.setTenantId(node.path("tenantId").asLong(0));
            entity.setMethod(node.path("method").asText());
            entity.setPath(node.path("path").asText());
            entity.setStatusCode(node.path("statusCode").asInt());
            entity.setLatencyMs(node.path("latencyMs").asInt());
            entity.setClientIp(node.path("clientIp").asText(null));
            entity.setRequestSize(node.has("requestSize") ? node.path("requestSize").asInt() : null);
            entity.setResponseSize(node.has("responseSize") ? node.path("responseSize").asInt() : null);
            entity.setErrorMessage(node.path("errorMessage").asText(null));

            long ts = node.path("timestamp").asLong(0);
            if (ts > 0) {
                entity.setCreatedAt(LocalDateTime.ofInstant(Instant.ofEpochMilli(ts), ZoneId.systemDefault()));
            } else {
                entity.setCreatedAt(LocalDateTime.now());
            }

            apiAccessLogMapper.insert(entity);
        } catch (Exception e) {
            log.error("Failed to process API access log: {}", message, e);
        }
    }
}
