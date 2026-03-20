package com.songhg.firefly.iot.connector.protocol.mqtt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import com.songhg.firefly.iot.connector.config.MqttProperties;
import com.songhg.firefly.iot.connector.protocol.downstream.NonMqttDownstreamDispatcher;
import com.songhg.firefly.iot.connector.protocol.dto.MqttSessionRoute;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Slf4j
@Component
@RequiredArgsConstructor
public class MqttDownstreamConsumer {

    private final ObjectMapper objectMapper;
    private final MqttProperties mqttProperties;
    private final NonMqttDownstreamDispatcher nonMqttDownstreamDispatcher;
    private final Optional<MqttSessionRouteRegistry> routeRegistry;
    private final Optional<EmbeddedMqttBroker> embeddedMqttBroker;
    private final Optional<EmbeddedMqttConnectionManager> connectionManager;
    private final Optional<MqttNodeRegistry> nodeRegistry;
    private final Optional<MqttRedisDownstreamRelay> downstreamRelay;

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

            if (tryDispatchByMqtt(payload, message)) {
                return;
            }

            if (nonMqttDownstreamDispatcher.dispatch(message)) {
                log.debug("Delivered downstream message through non-MQTT transport: deviceId={}", message.getDeviceId());
                return;
            }

            log.debug("Skip downstream message because no transport route is online: deviceId={}", message.getDeviceId());
        } catch (Exception ex) {
            log.error("Failed to consume MQTT downstream message: {}", ex.getMessage(), ex);
        }
    }

    private boolean tryDispatchByMqtt(String payload, DeviceMessage message) {
        if (!mqttProperties.isEnabled()) {
            return false;
        }

        MqttSessionRouteRegistry registry = routeRegistry.orElse(null);
        EmbeddedMqttBroker broker = embeddedMqttBroker.orElse(null);
        EmbeddedMqttConnectionManager localConnectionManager = connectionManager.orElse(null);
        MqttNodeRegistry localNodeRegistry = nodeRegistry.orElse(null);
        MqttRedisDownstreamRelay relay = downstreamRelay.orElse(null);
        if (registry == null || broker == null || localConnectionManager == null || localNodeRegistry == null || relay == null) {
            return false;
        }

        Optional<MqttSessionRoute> routeOptional = registry.findByDeviceId(message.getDeviceId());
        if (routeOptional.isEmpty()) {
            return false;
        }

        MqttSessionRoute route = routeOptional.get();
        if (broker.isLocalOwner(route)) {
            if (broker.publishDownstream(message, route)) {
                return true;
            }

            // A local publish failure usually means the in-memory route is stale, so
            // we clear it and let the generic downstream dispatcher try other transports.
            log.warn("Failed to publish MQTT downstream message locally, cleaning route: deviceId={}, clientId={}",
                    message.getDeviceId(), route.getClientId());
            registry.unregister(route);
            return tryRecoverLocalRoute(message, registry, broker, localConnectionManager);
        }

        if (!localNodeRegistry.isNodeAlive(route.getNodeId())) {
            log.warn("Detected stale MQTT route on offline node, cleaning route: deviceId={}, nodeId={}",
                    message.getDeviceId(), route.getNodeId());
            registry.unregister(route);
            return tryRecoverLocalRoute(message, registry, broker, localConnectionManager);
        }

        relay.forward(route.getNodeId(), payload, message);
        return true;
    }

    private boolean tryRecoverLocalRoute(DeviceMessage message,
                                         MqttSessionRouteRegistry registry,
                                         EmbeddedMqttBroker broker,
                                         EmbeddedMqttConnectionManager localConnectionManager) {
        Optional<MqttSessionRoute> localRouteOptional = localConnectionManager.getLocalRoute(message.getDeviceId());
        if (localRouteOptional.isEmpty()) {
            return false;
        }

        MqttSessionRoute localRoute = localRouteOptional.get();
        registry.register(localRoute);
        if (broker.publishDownstream(message, localRoute)) {
            return true;
        }

        log.warn("Failed to publish MQTT downstream message after stale-route recovery: deviceId={}, clientId={}",
                message.getDeviceId(), localRoute.getClientId());
        registry.unregister(localRoute);
        return false;
    }
}
