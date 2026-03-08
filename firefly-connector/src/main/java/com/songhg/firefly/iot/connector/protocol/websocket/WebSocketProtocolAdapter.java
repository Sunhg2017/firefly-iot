package com.songhg.firefly.iot.connector.protocol.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.protocol.ProtocolAdapter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * WebSocket 协议适配器 — 将 WebSocket 消息转为统一 DeviceMessage
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketProtocolAdapter implements ProtocolAdapter {

    private final ObjectMapper objectMapper;

    @Override
    public String getProtocol() {
        return "WEBSOCKET";
    }

    @Override
    public boolean supports(String topic) {
        return topic != null && topic.startsWith("/ws/");
    }

    @Override
    public DeviceMessage decode(String topic, byte[] payload, Map<String, String> headers) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> data = objectMapper.readValue(payload, LinkedHashMap.class);

            Long deviceId = headers != null && headers.containsKey("deviceId") ? Long.parseLong(headers.get("deviceId")) : null;
            Long tenantId = headers != null && headers.containsKey("tenantId") ? Long.parseLong(headers.get("tenantId")) : null;
            Long productId = headers != null && headers.containsKey("productId") ? Long.parseLong(headers.get("productId")) : null;

            DeviceMessage.MessageType type = topic.contains("/lifecycle/")
                    ? (topic.contains("online") ? DeviceMessage.MessageType.DEVICE_ONLINE : DeviceMessage.MessageType.DEVICE_OFFLINE)
                    : DeviceMessage.MessageType.PROPERTY_REPORT;

            return DeviceMessage.builder()
                    .messageId(UUID.randomUUID().toString())
                    .tenantId(tenantId)
                    .productId(productId)
                    .deviceId(deviceId)
                    .type(type)
                    .topic(topic)
                    .payload(data)
                    .timestamp(System.currentTimeMillis())
                    .build();
        } catch (Exception e) {
            log.error("Failed to decode WebSocket payload: {}", e.getMessage());
            return null;
        }
    }

    @Override
    public byte[] encode(DeviceMessage message) {
        try {
            return objectMapper.writeValueAsBytes(message.getPayload());
        } catch (Exception e) {
            log.error("Failed to encode WebSocket message: {}", e.getMessage());
            return "{}".getBytes(StandardCharsets.UTF_8);
        }
    }
}
