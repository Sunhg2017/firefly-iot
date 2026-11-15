package com.songhg.firefly.iot.connector.protocol.mqtt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import com.songhg.firefly.iot.connector.config.MqttProperties;
import com.songhg.firefly.iot.connector.protocol.downstream.DownlinkPendingQueue;
import com.songhg.firefly.iot.connector.protocol.downstream.NonMqttDownstreamDispatcher;
import com.songhg.firefly.iot.connector.protocol.dto.MqttSessionRoute;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
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
    private final DownlinkPendingQueue pendingQueue;
    private final DeviceMessageProducer deviceMessageProducer;
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
        DeviceMessage message;
        try {
            message = objectMapper.readValue(payload, DeviceMessage.class);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to deserialize downstream message", ex);
        }
        if (message.getDeviceId() == null) {
            log.warn("Skip MQTT downstream message because deviceId is missing: {}", payload);
            return;
        }

        if (tryDispatchByMqtt(payload, message)) {
            deviceMessageProducer.publishDownlinkAck(message.getDeviceId(), message.getMessageId());
            return;
        }

        if (nonMqttDownstreamDispatcher.dispatch(message)) {
            log.debug("Delivered downstream message through non-MQTT transport: deviceId={}", message.getDeviceId());
            deviceMessageProducer.publishDownlinkAck(message.getDeviceId(), message.getMessageId());
            return;
        }

        // 无在线路由：进入设备级待投递队列，设备重连后由 DownlinkPendingFlusher 补发；
        // 队列有界且带 TTL，避免离线设备造成 DLT 积压或内存无限增长。
        pendingQueue.enqueue(message);
        com.songhg.firefly.iot.common.metrics.Metrics.increment("firefly.connector.downlink.deferred");
        log.info("Downlink deferred because no online transport route: deviceId={}, messageId={}",
                message.getDeviceId(), message.getMessageId());
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
