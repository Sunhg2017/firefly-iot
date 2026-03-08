package com.songhg.firefly.iot.connector.protocol.mqtt;

import com.songhg.firefly.iot.connector.config.MqttProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "firefly.mqtt", name = "enabled", havingValue = "true", matchIfMissing = true)
public class MqttNodeRegistry {

    private static final String NODE_KEY_PREFIX = "connector:mqtt:node:";

    private final StringRedisTemplate redisTemplate;
    private final MqttProperties mqttProperties;

    public void refreshSelfHeartbeat() {
        redisTemplate.opsForValue().set(
                buildNodeKey(mqttProperties.getNodeId()),
                String.valueOf(System.currentTimeMillis()),
                Duration.ofSeconds(mqttProperties.getNodeHeartbeatTtlSeconds())
        );
    }

    public void removeSelfHeartbeat() {
        redisTemplate.delete(buildNodeKey(mqttProperties.getNodeId()));
    }

    public boolean isNodeAlive(String nodeId) {
        if (nodeId == null || nodeId.isBlank()) {
            return false;
        }
        Boolean exists = redisTemplate.hasKey(buildNodeKey(nodeId));
        return Boolean.TRUE.equals(exists);
    }

    private String buildNodeKey(String nodeId) {
        return NODE_KEY_PREFIX + nodeId;
    }
}
