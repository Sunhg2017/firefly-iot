package com.songhg.firefly.iot.connector.protocol.mqtt;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.config.MqttProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "firefly.mqtt", name = "enabled", havingValue = "true", matchIfMissing = true)
public class MqttRedisDownstreamRelay {

    private final StringRedisTemplate redisTemplate;
    private final MqttProperties mqttProperties;

    public void forward(String nodeId, String payload, DeviceMessage message) {
        redisTemplate.convertAndSend(mqttProperties.getRelayChannel(nodeId), payload);
        log.debug("Forwarded MQTT downstream message to relay channel: nodeId={}, deviceId={}",
                nodeId, message != null ? message.getDeviceId() : null);
    }
}
