package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.parser.model.KnownDeviceContext;
import com.songhg.firefly.iot.connector.parser.model.ProtocolParseOutcome;
import com.songhg.firefly.iot.connector.parser.service.ProtocolParseEngine;
import com.songhg.firefly.iot.connector.protocol.dto.DeviceAuthResult;
import com.songhg.firefly.iot.connector.protocol.dto.MqttConnectionContext;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * MQTT protocol adapter for device uplink messages.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MqttProtocolAdapter implements ProtocolAdapter {

    private final DeviceAuthService authService;
    private final DeviceMessageProducer messageProducer;
    private final MessageCodec messageCodec;
    private final ProtocolParseEngine protocolParseEngine;

    @Override
    public String getProtocol() {
        return "MQTT";
    }

    @Override
    public boolean supports(String topic) {
        return topic != null && topic.startsWith("/sys/");
    }

    /**
     * MQTT connect authentication, usually called by the broker auth webhook.
     */
    public DeviceAuthResult onConnect(String clientId, String username, String password) {
        String[] identity = parseIdentity(clientId, username);
        if (identity == null) {
            return DeviceAuthResult.fail("INVALID_CREDENTIALS");
        }

        DeviceAuthResult result = authService.authenticate(identity[0], identity[1], password);
        if (!result.isSuccess()) {
            return result;
        }

        handleConnected(buildContext(clientId, username, identity[0], identity[1], result));
        return result;
    }

    /**
     * MQTT disconnect callback.
     */
    public void onDisconnect(String clientId, Long deviceId, Long tenantId, Long productId) {
        String[] identity = parseIdentity(clientId, null);
        handleDisconnected(MqttConnectionContext.builder()
                .clientId(clientId)
                .productKey(identity != null ? identity[0] : null)
                .deviceName(identity != null ? identity[1] : null)
                .deviceId(deviceId)
                .tenantId(tenantId)
                .productId(productId)
                .build());
    }

    @Override
    public DeviceMessage decode(String topic, byte[] payload, Map<String, String> headers) {
        String[] identity = messageCodec.extractIdentity(topic);
        if (identity == null) {
            log.warn("Cannot extract identity from MQTT topic: {}", topic);
            return null;
        }

        String productKey = identity[0];
        String deviceName = identity[1];

        Long deviceId = headers != null && headers.containsKey("deviceId") ? Long.parseLong(headers.get("deviceId")) : null;
        Long tenantId = headers != null && headers.containsKey("tenantId") ? Long.parseLong(headers.get("tenantId")) : null;
        Long productId = headers != null && headers.containsKey("productId") ? Long.parseLong(headers.get("productId")) : null;

        if (deviceId == null) {
            DeviceAuthResult session = authService.resolveSession(productKey, deviceName);
            if (!session.isSuccess()) {
                log.warn("MQTT decode failed: session not found - productKey={}, deviceName={}",
                        productKey, deviceName);
                return null;
            }
            deviceId = session.getDeviceId();
            tenantId = session.getTenantId();
            productId = session.getProductId();
        }

        DeviceMessage message = messageCodec.decodeJson(topic, payload, deviceId, tenantId, productId);
        if (message != null) {
            message.setDeviceName(deviceName);
        }
        return message;
    }

    @Override
    public byte[] encode(DeviceMessage message) {
        return messageCodec.encodeJson(message);
    }

    public void onMessage(String topic, byte[] payload, Map<String, String> headers) {
        String[] identity = messageCodec.extractIdentity(topic);
        if (identity != null) {
            String productKey = identity[0];
            String deviceName = identity[1];
            Long deviceId = headers != null && headers.containsKey("deviceId") ? Long.parseLong(headers.get("deviceId")) : null;
            Long tenantId = headers != null && headers.containsKey("tenantId") ? Long.parseLong(headers.get("tenantId")) : null;
            Long productId = headers != null && headers.containsKey("productId") ? Long.parseLong(headers.get("productId")) : null;
            if (deviceId == null) {
                DeviceAuthResult session = authService.resolveSession(productKey, deviceName);
                if (session.isSuccess()) {
                    deviceId = session.getDeviceId();
                    tenantId = session.getTenantId();
                    productId = session.getProductId();
                }
            }

            ProtocolParseOutcome parseOutcome = protocolParseEngine.parse(
                    ProtocolParseEngine.buildContext(
                            "MQTT",
                            "MQTT",
                            topic,
                            payload,
                            headers,
                            null,
                            null,
                            productId,
                            productKey
                    ),
                    KnownDeviceContext.builder()
                            .tenantId(tenantId)
                            .productId(productId)
                            .deviceId(deviceId)
                            .deviceName(deviceName)
                            .productKey(productKey)
                            .build()
            );
            if (parseOutcome.isHandled()) {
                parseOutcome.getMessages().forEach(messageProducer::publishUpstream);
                log.debug("MQTT custom parser handled message: topic={}, productId={}, count={}",
                        topic, productId, parseOutcome.getMessages().size());
                return;
            }
        }

        DeviceMessage message = decode(topic, payload, headers);
        if (message != null) {
            messageProducer.publishUpstream(message);
            log.debug("MQTT message forwarded: topic={}, deviceId={}, type={}",
                    topic, message.getDeviceId(), message.getType());
        }
    }

    public MqttConnectionContext authenticateConnection(String clientId, String username, String password) {
        String[] identity = parseIdentity(clientId, username);
        if (identity == null) {
            log.warn("MQTT auth failed: invalid clientId={}, username={}", clientId, username);
            return null;
        }

        DeviceAuthResult result = authService.authenticate(identity[0], identity[1], password);
        if (!result.isSuccess()) {
            log.warn("MQTT auth failed: productKey={}, deviceName={}, error={}",
                    identity[0], identity[1], result.getErrorCode());
            return null;
        }

        return buildContext(clientId, username, identity[0], identity[1], result);
    }

    public MqttConnectionContext restoreConnection(String clientId, String username) {
        String[] identity = parseIdentity(clientId, username);
        if (identity == null) {
            return null;
        }

        DeviceAuthResult session = authService.resolveSession(identity[0], identity[1]);
        if (!session.isSuccess()) {
            return null;
        }
        return buildContext(clientId, username, identity[0], identity[1], session);
    }

    public void handleConnected(MqttConnectionContext context) {
        if (context == null) {
            return;
        }

        log.info("MQTT device connected: productKey={}, deviceName={}, deviceId={}",
                context.getProductKey(), context.getDeviceName(), context.getDeviceId());

        DeviceMessage onlineMsg = DeviceMessage.builder()
                .tenantId(context.getTenantId())
                .productId(context.getProductId())
                .deviceId(context.getDeviceId())
                .deviceName(context.getDeviceName())
                .type(DeviceMessage.MessageType.DEVICE_ONLINE)
                .payload(Map.of("clientId", context.getClientId(), "protocol", "MQTT"))
                .build();
        messageProducer.publishUpstream(onlineMsg);
    }

    public void handleDisconnected(MqttConnectionContext context) {
        if (context == null || context.getDeviceId() == null) {
            return;
        }

        // Keep the identity session until TTL expires to avoid reconnect/disconnect races across nodes.
        log.info("MQTT device disconnected: clientId={}, deviceId={}", context.getClientId(), context.getDeviceId());
        DeviceMessage offlineMsg = DeviceMessage.builder()
                .tenantId(context.getTenantId())
                .productId(context.getProductId())
                .deviceId(context.getDeviceId())
                .deviceName(context.getDeviceName())
                .type(DeviceMessage.MessageType.DEVICE_OFFLINE)
                .payload(Map.of("clientId", context.getClientId(), "protocol", "MQTT"))
                .build();
        messageProducer.publishUpstream(offlineMsg);
    }

    public boolean isOwnTopic(String clientId, String username, String topic) {
        String[] identity = parseIdentity(clientId, username);
        if (identity == null || topic == null || topic.isBlank()) {
            return false;
        }
        return topic.startsWith("/sys/" + identity[0] + "/" + identity[1] + "/");
    }

    private String[] parseIdentity(String clientId, String username) {
        if (username != null && username.contains("&")) {
            String[] parts = username.split("&", 2);
            return new String[]{parts[1], parts[0]};
        }
        if (clientId != null && clientId.contains(".")) {
            return clientId.split("\\.", 2);
        }
        return null;
    }

    private MqttConnectionContext buildContext(String clientId, String username,
                                               String productKey, String deviceName,
                                               DeviceAuthResult authResult) {
        return MqttConnectionContext.builder()
                .clientId(clientId)
                .username(username)
                .productKey(productKey)
                .deviceName(deviceName)
                .deviceId(authResult.getDeviceId())
                .tenantId(authResult.getTenantId())
                .productId(authResult.getProductId())
                .build();
    }
}
