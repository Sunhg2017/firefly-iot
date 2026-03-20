package com.songhg.firefly.iot.connector.protocol.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.DeviceLocatorInputDTO;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.protocol.downstream.DeviceIdentityResolveService;
import com.songhg.firefly.iot.connector.protocol.downstream.ResolvedDeviceIdentity;
import com.songhg.firefly.iot.connector.parser.model.KnownDeviceContext;
import com.songhg.firefly.iot.connector.parser.model.ProtocolParseOutcome;
import com.songhg.firefly.iot.connector.parser.service.ProtocolParseEngine;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URLDecoder;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSocket 设备连接处理器 — 管理设备 WebSocket 会话，接收消息并发布到 Kafka
 *
 * <p>设备通过 ws://host:port/ws/device?deviceId=xxx&productId=yyy&tenantId=zzz 连接。
 * 上行 JSON 消息将解码为 DeviceMessage 发布到 Kafka。</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DeviceWebSocketHandler extends TextWebSocketHandler {

    private final ObjectMapper objectMapper;
    private final DeviceMessageProducer messageProducer;
    private final ProtocolParseEngine protocolParseEngine;
    private final DeviceIdentityResolveService deviceIdentityResolveService;

    /** sessionId → SessionInfo */
    private final Map<String, SessionInfo> sessions = new ConcurrentHashMap<>();

    // ==================== Lifecycle ====================

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        Map<String, String> params = parseQueryParams(session.getUri());
        String deviceId = params.getOrDefault("deviceId", "");
        String productId = params.getOrDefault("productId", "");
        String tenantId = params.getOrDefault("tenantId", "");
        String deviceName = params.getOrDefault("deviceName", "");
        String productKey = params.getOrDefault("productKey", "");

        SessionInfo info = new SessionInfo();
        info.setSessionId(session.getId());
        info.setDeviceId(parseLong(deviceId));
        info.setProductId(parseLong(productId));
        info.setTenantId(parseLong(tenantId));
        info.setDeviceName(deviceName);
        info.setProductKey(productKey);
        info.setRemoteAddress(session.getRemoteAddress() != null ? session.getRemoteAddress().toString() : "unknown");
        info.setConnectedAt(System.currentTimeMillis());
        info.setSession(session);

        // WebSocket devices may connect with business identifiers only, so we
        // resolve the platform device once and keep the route on the session.
        ResolvedDeviceIdentity resolvedIdentity = resolveSessionIdentity(info, params.get("locators"));
        if (resolvedIdentity != null) {
            info.setDeviceId(resolvedIdentity.getDeviceId());
            info.setTenantId(firstNonNull(info.getTenantId(), resolvedIdentity.getTenantId()));
            info.setProductId(firstNonNull(info.getProductId(), resolvedIdentity.getProductId()));
            info.setProductKey(firstNonBlank(info.getProductKey(), resolvedIdentity.getProductKey()));
            info.setDeviceName(firstNonBlank(info.getDeviceName(), resolvedIdentity.getDeviceName()));
        }

        sessions.put(session.getId(), info);
        log.info("WebSocket connected: sessionId={}, deviceId={}, remote={}",
                session.getId(), info.getDeviceId(), info.getRemoteAddress());

        // Publish DEVICE_ONLINE event
        if (info.getDeviceId() != null) {
            publishLifecycle(info, DeviceMessage.MessageType.DEVICE_ONLINE);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        SessionInfo info = sessions.remove(session.getId());
        if (info != null) {
            log.info("WebSocket disconnected: sessionId={}, deviceId={}, status={}", session.getId(), info.getDeviceId(), status);
            if (info.getDeviceId() != null) {
                publishLifecycle(info, DeviceMessage.MessageType.DEVICE_OFFLINE);
            }
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("WebSocket transport error: sessionId={}, error={}", session.getId(), exception.getMessage());
    }

    // ==================== Message Handling ====================

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        SessionInfo info = sessions.get(session.getId());
        if (info == null) return;

        info.setLastMessageAt(System.currentTimeMillis());
        info.incrementMessageCount();

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> payload = objectMapper.readValue(message.getPayload(), LinkedHashMap.class);

            // Allow message-level overrides for type and topic
            String typeStr = payload.containsKey("_type") ? String.valueOf(payload.remove("_type")) : null;
            String topic = payload.containsKey("_topic") ? String.valueOf(payload.remove("_topic")) : "/ws/upstream/" + info.getDeviceId();

            DeviceMessage.MessageType msgType = DeviceMessage.MessageType.PROPERTY_REPORT;
            if (typeStr != null) {
                try { msgType = DeviceMessage.MessageType.valueOf(typeStr); } catch (IllegalArgumentException ignored) {}
            }

            ProtocolParseOutcome parseOutcome = protocolParseEngine.parse(
                    ProtocolParseEngine.buildContext(
                            "WEBSOCKET",
                            "WEBSOCKET",
                            topic,
                            message.getPayload().getBytes(java.nio.charset.StandardCharsets.UTF_8),
                            Map.of("sessionId", info.getSessionId()),
                            info.getSessionId(),
                            info.getRemoteAddress(),
                            info.getProductId(),
                            null
                    ),
                    KnownDeviceContext.builder()
                            .tenantId(info.getTenantId())
                            .productId(info.getProductId())
                            .deviceId(info.getDeviceId())
                            .deviceName(info.getDeviceName())
                            .build()
            );
            if (parseOutcome.isHandled()) {
                parseOutcome.getMessages().forEach(messageProducer::publishUpstream);
                return;
            }

            DeviceMessage deviceMessage = DeviceMessage.builder()
                    .messageId(UUID.randomUUID().toString())
                    .tenantId(info.getTenantId())
                    .productId(info.getProductId())
                    .deviceId(info.getDeviceId())
                    .deviceName(info.getDeviceName())
                    .type(msgType)
                    .topic(topic)
                    .payload(payload)
                    .timestamp(System.currentTimeMillis())
                    .build();

            messageProducer.publishUpstream(deviceMessage);
            log.debug("WebSocket message received: sessionId={}, deviceId={}, payloadSize={}", session.getId(), info.getDeviceId(), payload.size());
        } catch (Exception e) {
            log.error("Failed to process WebSocket message: sessionId={}, error={}", session.getId(), e.getMessage());
        }
    }

    // ==================== Public API ====================

    public Collection<SessionInfo> listSessions() {
        return Collections.unmodifiableCollection(sessions.values());
    }

    public SessionInfo getSession(String sessionId) {
        return sessions.get(sessionId);
    }

    public List<SessionInfo> listSessionsByDeviceId(Long deviceId) {
        if (deviceId == null) {
            return List.of();
        }
        List<SessionInfo> matched = new ArrayList<>();
        for (SessionInfo sessionInfo : sessions.values()) {
            if (sessionInfo != null
                    && deviceId.equals(sessionInfo.getDeviceId())
                    && sessionInfo.getSession() != null
                    && sessionInfo.getSession().isOpen()) {
                matched.add(sessionInfo);
            }
        }
        return matched;
    }

    public int getSessionCount() {
        return sessions.size();
    }

    public boolean sendMessage(String sessionId, String text) {
        SessionInfo info = sessions.get(sessionId);
        if (info == null || !info.getSession().isOpen()) return false;
        try {
            info.getSession().sendMessage(new TextMessage(text));
            return true;
        } catch (IOException e) {
            log.error("Failed to send WebSocket message: sessionId={}, error={}", sessionId, e.getMessage());
            return false;
        }
    }

    public int broadcast(String text) {
        int sent = 0;
        for (SessionInfo info : sessions.values()) {
            if (info.getSession().isOpen()) {
                try {
                    info.getSession().sendMessage(new TextMessage(text));
                    sent++;
                } catch (IOException e) {
                    log.debug("Broadcast failed for session {}: {}", info.getSessionId(), e.getMessage());
                }
            }
        }
        return sent;
    }

    public boolean disconnect(String sessionId) {
        SessionInfo info = sessions.get(sessionId);
        if (info == null) return false;
        try {
            info.getSession().close(CloseStatus.NORMAL);
            return true;
        } catch (IOException e) {
            log.error("Failed to close WebSocket session: sessionId={}, error={}", sessionId, e.getMessage());
            return false;
        }
    }

    // ==================== Helpers ====================

    private void publishLifecycle(SessionInfo info, DeviceMessage.MessageType type) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sessionId", info.getSessionId());
        payload.put("remoteAddress", info.getRemoteAddress());
        payload.put("timestamp", System.currentTimeMillis());

        DeviceMessage message = DeviceMessage.builder()
                .messageId(UUID.randomUUID().toString())
                .tenantId(info.getTenantId())
                .productId(info.getProductId())
                .deviceId(info.getDeviceId())
                .deviceName(info.getDeviceName())
                .type(type)
                .topic("/ws/lifecycle/" + info.getDeviceId())
                .payload(payload)
                .timestamp(System.currentTimeMillis())
                .build();

        messageProducer.publishUpstream(message);
    }

    private Map<String, String> parseQueryParams(URI uri) {
        Map<String, String> params = new HashMap<>();
        if (uri == null || uri.getQuery() == null) return params;
        for (String pair : uri.getQuery().split("&")) {
            int idx = pair.indexOf('=');
            if (idx > 0) {
                params.put(
                        URLDecoder.decode(pair.substring(0, idx), StandardCharsets.UTF_8),
                        URLDecoder.decode(pair.substring(idx + 1), StandardCharsets.UTF_8)
                );
            }
        }
        return params;
    }

    private Long parseLong(String value) {
        if (value == null || value.isEmpty()) return null;
        try { return Long.parseLong(value); } catch (NumberFormatException e) { return null; }
    }

    private ResolvedDeviceIdentity resolveSessionIdentity(SessionInfo info, String locatorJson) {
        if (info.getDeviceId() != null) {
            ResolvedDeviceIdentity resolved = deviceIdentityResolveService.loadByDeviceId(info.getDeviceId());
            if (resolved != null) {
                return resolved;
            }
        }
        if (info.getProductKey() == null || info.getProductKey().isBlank()) {
            return null;
        }
        return deviceIdentityResolveService.resolveByProductKey(
                info.getProductKey(),
                info.getDeviceName(),
                parseLocators(locatorJson)
        );
    }

    private List<DeviceLocatorInputDTO> parseLocators(String locatorJson) {
        if (locatorJson == null || locatorJson.isBlank()) {
            return List.of();
        }
        try {
            DeviceLocatorInputDTO[] locators = objectMapper.readValue(locatorJson, DeviceLocatorInputDTO[].class);
            return locators == null ? List.of() : Arrays.asList(locators);
        } catch (Exception ex) {
            log.warn("Failed to parse WebSocket locator payload: {}", ex.getMessage());
            return List.of();
        }
    }

    private Long firstNonNull(Long currentValue, Long fallbackValue) {
        return currentValue != null ? currentValue : fallbackValue;
    }

    private String firstNonBlank(String currentValue, String fallbackValue) {
        String normalizedCurrent = currentValue == null ? null : currentValue.trim();
        if (normalizedCurrent != null && !normalizedCurrent.isEmpty()) {
            return normalizedCurrent;
        }
        if (fallbackValue == null || fallbackValue.isBlank()) {
            return currentValue;
        }
        return fallbackValue.trim();
    }

    // ==================== SessionInfo DTO ====================

    @lombok.Data
    public static class SessionInfo {
        private String sessionId;
        private Long deviceId;
        private Long productId;
        private String productKey;
        private Long tenantId;
        private String deviceName;
        private String remoteAddress;
        private long connectedAt;
        private long lastMessageAt;
        private long messageCount;

        @com.fasterxml.jackson.annotation.JsonIgnore
        private transient WebSocketSession session;

        public void incrementMessageCount() {
            this.messageCount++;
        }
    }
}
