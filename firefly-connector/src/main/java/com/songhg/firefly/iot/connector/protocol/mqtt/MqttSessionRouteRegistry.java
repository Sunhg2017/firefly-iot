package com.songhg.firefly.iot.connector.protocol.mqtt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.connector.config.MqttProperties;
import com.songhg.firefly.iot.connector.protocol.dto.MqttSessionRoute;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "firefly.mqtt", name = "enabled", havingValue = "true", matchIfMissing = true)
public class MqttSessionRouteRegistry {

    private static final String DEVICE_ROUTE_KEY_PREFIX = "connector:mqtt:route:device:";

    private static final DefaultRedisScript<Long> TOUCH_IF_MATCH_OR_ABSENT_SCRIPT = new DefaultRedisScript<>(
            """
            local current = redis.call('get', KEYS[1])
            if (not current) or current == ARGV[1] then
                redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[2])
                return 1
            end
            return 0
            """,
            Long.class
    );

    private static final DefaultRedisScript<Long> DELETE_IF_MATCH_SCRIPT = new DefaultRedisScript<>(
            """
            if redis.call('get', KEYS[1]) == ARGV[1] then
                return redis.call('del', KEYS[1])
            end
            return 0
            """,
            Long.class
    );

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final MqttProperties mqttProperties;

    public void register(MqttSessionRoute route) {
        String routeJson = serialize(route);
        if (routeJson == null) {
            return;
        }

        Duration ttl = Duration.ofSeconds(mqttProperties.getRouteTtlSeconds());
        redisTemplate.opsForValue().set(buildDeviceRouteKey(route.getDeviceId()), routeJson, ttl);
    }

    public boolean refresh(MqttSessionRoute route) {
        String routeJson = serialize(route);
        if (routeJson == null) {
            return false;
        }

        String ttlText = String.valueOf(mqttProperties.getRouteTtlSeconds());
        Long deviceResult = redisTemplate.execute(
                TOUCH_IF_MATCH_OR_ABSENT_SCRIPT,
                List.of(buildDeviceRouteKey(route.getDeviceId())),
                routeJson,
                ttlText
        );
        return Long.valueOf(1L).equals(deviceResult);
    }

    public void unregister(MqttSessionRoute route) {
        String routeJson = serialize(route);
        if (routeJson == null) {
            return;
        }

        redisTemplate.execute(
                DELETE_IF_MATCH_SCRIPT,
                List.of(buildDeviceRouteKey(route.getDeviceId())),
                routeJson
        );
    }

    public Optional<MqttSessionRoute> findByDeviceId(Long deviceId) {
        if (deviceId == null) {
            return Optional.empty();
        }
        String routeJson = redisTemplate.opsForValue().get(buildDeviceRouteKey(deviceId));
        if (routeJson == null || routeJson.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(objectMapper.readValue(routeJson, MqttSessionRoute.class));
        } catch (Exception ex) {
            log.warn("Failed to deserialize MQTT session route for deviceId={}: {}", deviceId, ex.getMessage());
            return Optional.empty();
        }
    }

    private String buildDeviceRouteKey(Long deviceId) {
        return DEVICE_ROUTE_KEY_PREFIX + deviceId;
    }

    private String serialize(MqttSessionRoute route) {
        if (route == null || route.getDeviceId() == null || route.getProductKey() == null || route.getDeviceName() == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(route);
        } catch (Exception ex) {
            log.error("Failed to serialize MQTT session route: {}", ex.getMessage(), ex);
            return null;
        }
    }
}
