package com.songhg.firefly.iot.connector.protocol.mqtt;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.config.MqttProperties;
import com.songhg.firefly.iot.connector.parser.model.DownlinkEncodeContext;
import com.songhg.firefly.iot.connector.parser.model.ProtocolEncodeOutcome;
import com.songhg.firefly.iot.connector.parser.service.ProtocolDownlinkEncodeService;
import com.songhg.firefly.iot.connector.protocol.MessageCodec;
import com.songhg.firefly.iot.connector.protocol.dto.MqttSessionRoute;
import io.moquette.broker.Server;
import io.moquette.broker.config.IConfig;
import io.moquette.broker.config.MemoryConfig;
import io.netty.buffer.Unpooled;
import io.netty.handler.codec.mqtt.MqttMessageBuilders;
import io.netty.handler.codec.mqtt.MqttPublishMessage;
import io.netty.handler.codec.mqtt.MqttQoS;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "firefly.mqtt", name = "enabled", havingValue = "true", matchIfMissing = true)
public class EmbeddedMqttBroker {

    private final MqttProperties mqttProperties;
    private final EmbeddedMqttAuthenticator authenticator;
    private final EmbeddedMqttAuthorizator authorizator;
    private final EmbeddedMqttInterceptHandler interceptHandler;
    private final EmbeddedMqttConnectionManager connectionManager;
    private final MqttNodeRegistry nodeRegistry;
    private final MessageCodec messageCodec;
    private final ProtocolDownlinkEncodeService protocolDownlinkEncodeService;

    private final ScheduledExecutorService routeRefreshExecutor = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "firefly-mqtt-route-refresh");
        thread.setDaemon(true);
        return thread;
    });

    private final AtomicBoolean started = new AtomicBoolean(false);
    private Server brokerServer;

    @PostConstruct
    public void start() {
        Properties config = new Properties();
        config.setProperty(IConfig.HOST_PROPERTY_NAME, mqttProperties.getHost());
        config.setProperty(IConfig.PORT_PROPERTY_NAME, String.valueOf(mqttProperties.getPort()));
        config.setProperty(IConfig.ALLOW_ANONYMOUS_PROPERTY_NAME, String.valueOf(mqttProperties.isAllowAnonymous()));
        config.setProperty(IConfig.PERSISTENCE_ENABLED_PROPERTY_NAME, String.valueOf(mqttProperties.isPersistenceEnabled()));
        config.setProperty(IConfig.DATA_PATH_PROPERTY_NAME, mqttProperties.getDataPath());
        config.setProperty(IConfig.NETTY_MAX_BYTES_PROPERTY_NAME, String.valueOf(mqttProperties.getMaxMessageSize()));
        config.setProperty(IConfig.ENABLE_TELEMETRY_NAME, "false");
        config.setProperty(IConfig.PERSISTENT_QUEUE_TYPE_PROPERTY_NAME, "segmented");

        brokerServer = new Server();
        try {
            brokerServer.startServer(
                    new MemoryConfig(config),
                    List.of(interceptHandler),
                    null,
                    authenticator,
                    authorizator
            );
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to start embedded MQTT broker", ex);
        }

        started.set(true);
        nodeRegistry.refreshSelfHeartbeat();
        long refreshSeconds = mqttProperties.getRouteRefreshIntervalSeconds();
        routeRefreshExecutor.scheduleAtFixedRate(this::refreshRoutesSafely, refreshSeconds, refreshSeconds, TimeUnit.SECONDS);
        long heartbeatSeconds = mqttProperties.getNodeHeartbeatIntervalSeconds();
        routeRefreshExecutor.scheduleAtFixedRate(this::refreshNodeHeartbeatSafely, heartbeatSeconds, heartbeatSeconds, TimeUnit.SECONDS);
        log.info("Embedded MQTT broker started: nodeId={}, bind={}:{}, consumerGroup={}",
                mqttProperties.getNodeId(), mqttProperties.getHost(), mqttProperties.getPort(),
                mqttProperties.getDownstreamConsumerGroup());
    }

    @PreDestroy
    public void stop() {
        started.set(false);
        routeRefreshExecutor.shutdownNow();
        connectionManager.clearAll();
        nodeRegistry.removeSelfHeartbeat();
        if (brokerServer != null) {
            brokerServer.stopServer();
            log.info("Embedded MQTT broker stopped: nodeId={}", mqttProperties.getNodeId());
        }
    }

    public boolean publishDownstream(DeviceMessage message, MqttSessionRoute route) {
        if (!started.get() || brokerServer == null || message == null || route == null) {
            return false;
        }
        if (!connectionManager.isLocalOwner(route)) {
            return false;
        }

        String defaultTopic = message.getTopic();
        if (defaultTopic == null || defaultTopic.isBlank()) {
            defaultTopic = messageCodec.buildDownstreamTopic(route.getProductKey(), route.getDeviceName(), message.getType());
        }

        ProtocolEncodeOutcome encodeOutcome = protocolDownlinkEncodeService.encode(
                DownlinkEncodeContext.builder()
                        .protocol("MQTT")
                        .transport("MQTT")
                        .topic(defaultTopic)
                        .messageType(message.getType() == null ? null : message.getType().name())
                        .messageId(message.getMessageId())
                        .payload(message.getPayload())
                        .timestamp(message.getTimestamp())
                        .tenantId(route.getTenantId())
                        .productId(route.getProductId())
                        .productKey(route.getProductKey())
                        .deviceId(route.getDeviceId())
                        .deviceName(route.getDeviceName())
                        .headers(Map.of())
                        .build()
        );
        if (encodeOutcome.isDrop()) {
            log.warn("Downlink message dropped by custom encoder: deviceId={}, productId={}",
                    route.getDeviceId(), route.getProductId());
            return true;
        }
        String topic = encodeOutcome.isHandled() ? encodeOutcome.getTopic() : defaultTopic;
        byte[] payload = encodeOutcome.isHandled() ? encodeOutcome.getPayload() : messageCodec.encodeJson(message);
        MqttPublishMessage publishMessage = MqttMessageBuilders.publish()
                .topicName(topic)
                .qos(MqttQoS.valueOf(mqttProperties.getDownstreamQos()))
                .retained(false)
                .payload(Unpooled.wrappedBuffer(payload))
                .build();

        brokerServer.internalPublish(publishMessage, mqttProperties.getNodeId());
        return true;
    }

    public boolean isLocalOwner(MqttSessionRoute route) {
        return connectionManager.isLocalOwner(route);
    }

    private void refreshRoutesSafely() {
        try {
            connectionManager.refreshLocalRoutes();
        } catch (Exception ex) {
            log.warn("Failed to refresh MQTT route heartbeat: {}", ex.getMessage(), ex);
        }
    }

    private void refreshNodeHeartbeatSafely() {
        try {
            nodeRegistry.refreshSelfHeartbeat();
        } catch (Exception ex) {
            log.warn("Failed to refresh MQTT node heartbeat: {}", ex.getMessage(), ex);
        }
    }
}
