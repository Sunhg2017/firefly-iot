package com.songhg.firefly.iot.connector.protocol.mqtt;

import com.songhg.firefly.iot.connector.config.MqttProperties;
import com.songhg.firefly.iot.connector.protocol.MqttProtocolAdapter;
import com.songhg.firefly.iot.connector.protocol.dto.MqttConnectionContext;
import com.songhg.firefly.iot.connector.protocol.dto.MqttSessionRoute;
import io.moquette.interception.messages.InterceptConnectMessage;
import io.moquette.interception.messages.InterceptPublishMessage;
import io.netty.buffer.ByteBufUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "firefly.mqtt", name = "enabled", havingValue = "true", matchIfMissing = true)
public class EmbeddedMqttConnectionManager {

    private final MqttProtocolAdapter mqttProtocolAdapter;
    private final MqttSessionRouteRegistry routeRegistry;
    private final MqttProperties mqttProperties;

    private final ConcurrentHashMap<String, MqttConnectionContext> pendingContexts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, MqttSessionRoute> localRoutesByClientId = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Long, MqttSessionRoute> localRoutesByDeviceId = new ConcurrentHashMap<>();

    public boolean authenticate(String clientId, String username, byte[] password) {
        String passwordText = password == null ? null : new String(password, StandardCharsets.UTF_8);
        MqttConnectionContext context = mqttProtocolAdapter.authenticateConnection(clientId, username, passwordText);
        if (context == null) {
            pendingContexts.remove(clientId);
            return false;
        }
        pendingContexts.put(clientId, context);
        return true;
    }

    public void handleConnected(InterceptConnectMessage message) {
        String clientId = message.getClientID();
        MqttConnectionContext context = pendingContexts.remove(clientId);
        if (context == null) {
            context = mqttProtocolAdapter.restoreConnection(clientId, message.getUsername());
        }
        if (context == null) {
            log.warn("MQTT connect intercept ignored because session context is missing: clientId={}", clientId);
            return;
        }

        registerLocalRoute(context);
        mqttProtocolAdapter.handleConnected(context);
    }

    public void handleDisconnected(String clientId, String username, boolean connectionLost) {
        pendingContexts.remove(clientId);

        MqttSessionRoute route = localRoutesByClientId.remove(clientId);
        if (route == null) {
            log.debug("MQTT disconnect ignored because local route is missing: clientId={}, lost={}",
                    clientId, connectionLost);
            return;
        }

        localRoutesByDeviceId.remove(route.getDeviceId(), route);
        routeRegistry.unregister(route);
        mqttProtocolAdapter.handleDisconnected(toContext(route));
    }

    public void handlePublished(InterceptPublishMessage message) {
        MqttSessionRoute route = localRoutesByClientId.get(message.getClientID());
        if (route == null) {
            MqttConnectionContext restored = mqttProtocolAdapter.restoreConnection(message.getClientID(), message.getUsername());
            if (restored == null) {
                log.warn("MQTT publish ignored because session context is missing: clientId={}, topic={}",
                        message.getClientID(), message.getTopicName());
                return;
            }
            registerLocalRoute(restored);
            route = localRoutesByClientId.get(message.getClientID());
            if (route == null) {
                return;
            }
        }

        byte[] payload = ByteBufUtil.getBytes(message.getPayload());
        mqttProtocolAdapter.onMessage(message.getTopicName(), payload, buildHeaders(route));

        if (!routeRegistry.refresh(route)) {
            evictLocalRoute(route);
        }
    }

    public boolean refreshLocalRoutes() {
        boolean allOwned = true;
        for (MqttSessionRoute route : snapshotLocalRoutes()) {
            if (!routeRegistry.refresh(route)) {
                allOwned = false;
                log.warn("MQTT route ownership changed, evicting stale local route: deviceId={}, clientId={}",
                        route.getDeviceId(), route.getClientId());
                evictLocalRoute(route);
            }
        }
        return allOwned;
    }

    public Optional<MqttSessionRoute> getLocalRoute(Long deviceId) {
        return Optional.ofNullable(localRoutesByDeviceId.get(deviceId));
    }

    public boolean isLocalOwner(MqttSessionRoute route) {
        if (route == null) {
            return false;
        }
        return Objects.equals(route.getNodeId(), mqttProperties.getNodeId())
                && Objects.equals(localRoutesByDeviceId.get(route.getDeviceId()), route);
    }

    public List<MqttSessionRoute> snapshotLocalRoutes() {
        return new ArrayList<>(localRoutesByDeviceId.values());
    }

    public void clearAll() {
        for (MqttSessionRoute route : snapshotLocalRoutes()) {
            routeRegistry.unregister(route);
        }
        pendingContexts.clear();
        localRoutesByClientId.clear();
        localRoutesByDeviceId.clear();
    }

    private void registerLocalRoute(MqttConnectionContext context) {
        MqttSessionRoute route = context.toRoute(mqttProperties.getNodeId());
        if (route.getDeviceId() == null) {
            return;
        }

        MqttSessionRoute previousByDevice = localRoutesByDeviceId.put(route.getDeviceId(), route);
        if (previousByDevice != null && !Objects.equals(previousByDevice.getClientId(), route.getClientId())) {
            localRoutesByClientId.remove(previousByDevice.getClientId(), previousByDevice);
        }

        MqttSessionRoute previousByClient = localRoutesByClientId.put(route.getClientId(), route);
        if (previousByClient != null && !Objects.equals(previousByClient.getDeviceId(), route.getDeviceId())) {
            localRoutesByDeviceId.remove(previousByClient.getDeviceId(), previousByClient);
        }

        routeRegistry.register(route);
    }

    private void evictLocalRoute(MqttSessionRoute route) {
        if (route == null) {
            return;
        }
        localRoutesByClientId.remove(route.getClientId(), route);
        localRoutesByDeviceId.remove(route.getDeviceId(), route);
    }

    private Map<String, String> buildHeaders(MqttSessionRoute route) {
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("deviceId", String.valueOf(route.getDeviceId()));
        headers.put("tenantId", String.valueOf(route.getTenantId()));
        headers.put("productId", String.valueOf(route.getProductId()));
        return headers;
    }

    private MqttConnectionContext toContext(MqttSessionRoute route) {
        return MqttConnectionContext.builder()
                .clientId(route.getClientId())
                .productKey(route.getProductKey())
                .deviceName(route.getDeviceName())
                .deviceId(route.getDeviceId())
                .tenantId(route.getTenantId())
                .productId(route.getProductId())
                .build();
    }
}
