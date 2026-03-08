package com.songhg.firefly.iot.connector.protocol.mqtt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.config.MqttProperties;
import com.songhg.firefly.iot.connector.protocol.dto.MqttSessionRoute;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "firefly.mqtt", name = "enabled", havingValue = "true", matchIfMissing = true)
public class MqttRedisDownstreamMessageListener implements MessageListener {

    private final ObjectMapper objectMapper;
    private final EmbeddedMqttConnectionManager connectionManager;
    private final EmbeddedMqttBroker embeddedMqttBroker;
    private final MqttProperties mqttProperties;

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String channel = new String(message.getChannel(), StandardCharsets.UTF_8);
            if (!mqttProperties.getRelayChannel(mqttProperties.getNodeId()).equals(channel)) {
                return;
            }

            DeviceMessage deviceMessage = objectMapper.readValue(message.getBody(), DeviceMessage.class);
            Optional<MqttSessionRoute> localRoute = connectionManager.getLocalRoute(deviceMessage.getDeviceId());
            if (localRoute.isEmpty()) {
                log.debug("Skip relayed MQTT downstream message because local route is missing: deviceId={}",
                        deviceMessage.getDeviceId());
                return;
            }

            if (!embeddedMqttBroker.publishDownstream(deviceMessage, localRoute.get())) {
                log.warn("Failed to publish relayed MQTT downstream message locally: deviceId={}, clientId={}",
                        deviceMessage.getDeviceId(), localRoute.get().getClientId());
            }
        } catch (Exception ex) {
            log.error("Failed to process relayed MQTT downstream message: {}", ex.getMessage(), ex);
        }
    }
}
