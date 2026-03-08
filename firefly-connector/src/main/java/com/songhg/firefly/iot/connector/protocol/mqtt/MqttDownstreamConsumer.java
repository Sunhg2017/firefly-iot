package com.songhg.firefly.iot.connector.protocol.mqtt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import com.songhg.firefly.iot.connector.protocol.dto.MqttSessionRoute;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "firefly.mqtt", name = "enabled", havingValue = "true", matchIfMissing = true)
public class MqttDownstreamConsumer {

    private final ObjectMapper objectMapper;
    private final MqttSessionRouteRegistry routeRegistry;
    private final EmbeddedMqttBroker embeddedMqttBroker;
    private final EmbeddedMqttConnectionManager connectionManager;
    private final MqttNodeRegistry nodeRegistry;
    private final MqttRedisDownstreamRelay downstreamRelay;

    @KafkaListener(
            topics = KafkaTopics.DEVICE_MESSAGE_DOWN,
            groupId = "#{@mqttProperties.downstreamConsumerGroup}"
    )
    public void onDownstreamMessage(String payload) {
        try {
            DeviceMessage message = objectMapper.readValue(payload, DeviceMessage.class);
            if (message.getDeviceId() == null) {
                log.warn("Skip MQTT downstream message because deviceId is missing: {}", payload);
                return;
            }

            Optional<MqttSessionRoute> routeOptional = routeRegistry.findByDeviceId(message.getDeviceId());
            if (routeOptional.isEmpty()) {
                log.debug("Skip MQTT downstream message because device route is offline: deviceId={}", message.getDeviceId());
                return;
            }

            MqttSessionRoute route = routeOptional.get();
            if (embeddedMqttBroker.isLocalOwner(route)) {
                if (!embeddedMqttBroker.publishDownstream(message, route)) {
                    log.warn("Failed to publish MQTT downstream message locally: deviceId={}, clientId={}",
                            message.getDeviceId(), route.getClientId());
                }
                return;
            }

            if (!nodeRegistry.isNodeAlive(route.getNodeId())) {
                log.warn("Detected stale MQTT route on offline node, cleaning route: deviceId={}, nodeId={}",
                        message.getDeviceId(), route.getNodeId());
                routeRegistry.unregister(route);

                connectionManager.getLocalRoute(message.getDeviceId()).ifPresent(localRoute -> {
                    routeRegistry.register(localRoute);
                    if (!embeddedMqttBroker.publishDownstream(message, localRoute)) {
                        log.warn("Failed to publish MQTT downstream message after stale-route recovery: deviceId={}, clientId={}",
                                message.getDeviceId(), localRoute.getClientId());
                    }
                });
                return;
            }

            downstreamRelay.forward(route.getNodeId(), payload, message);
        } catch (Exception ex) {
            log.error("Failed to consume MQTT downstream message: {}", ex.getMessage(), ex);
        }
    }
}
