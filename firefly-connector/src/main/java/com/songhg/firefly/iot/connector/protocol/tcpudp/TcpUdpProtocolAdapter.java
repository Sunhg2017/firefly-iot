package com.songhg.firefly.iot.connector.protocol.tcpudp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.parser.model.KnownDeviceContext;
import com.songhg.firefly.iot.connector.parser.model.ProtocolParseOutcome;
import com.songhg.firefly.iot.connector.protocol.ProtocolAdapter;
import com.songhg.firefly.iot.connector.parser.service.ProtocolParseEngine;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * TCP/UDP 协议适配器 — 将原始 TCP/UDP 消息转为统一 DeviceMessage 并发布到 Kafka
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TcpUdpProtocolAdapter implements ProtocolAdapter {

    private final ObjectMapper objectMapper;
    private final DeviceMessageProducer messageProducer;
    private final ProtocolParseEngine protocolParseEngine;

    @Override
    public String getProtocol() {
        return "TCP_UDP";
    }

    @Override
    public boolean supports(String topic) {
        return topic != null && (topic.startsWith("/tcp/") || topic.startsWith("/udp/"));
    }

    @Override
    public DeviceMessage decode(String topic, byte[] payload, Map<String, String> headers) {
        try {
            Map<String, Object> data;
            String payloadStr = new String(payload, StandardCharsets.UTF_8).trim();

            // Try JSON parse first; fall back to raw text
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> parsed = objectMapper.readValue(payloadStr, LinkedHashMap.class);
                data = parsed;
            } catch (Exception e) {
                data = new LinkedHashMap<>();
                data.put("raw", payloadStr);
            }

            String sessionId = headers != null ? headers.getOrDefault("sessionId", "") : "";
            String protocol = headers != null ? headers.getOrDefault("protocol", "TCP") : "TCP";
            String remoteAddress = headers != null ? headers.getOrDefault("remoteAddress", "") : "";

            data.put("_sessionId", sessionId);
            data.put("_protocol", protocol);
            data.put("_remoteAddress", remoteAddress);

            return DeviceMessage.builder()
                    .messageId(UUID.randomUUID().toString())
                    .tenantId(parseLong(headerValue(headers, "tenantId")))
                    .productId(parseLong(headerValue(headers, "productId")))
                    .deviceId(parseLong(headerValue(headers, "deviceId")))
                    .deviceName(headerValue(headers, "deviceName"))
                    .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                    .topic(topic)
                    .payload(data)
                    .timestamp(System.currentTimeMillis())
                    .build();
        } catch (Exception e) {
            log.error("Failed to decode TCP/UDP payload: {}", e.getMessage());
            return null;
        }
    }

    @Override
    public byte[] encode(DeviceMessage message) {
        try {
            return objectMapper.writeValueAsBytes(message.getPayload());
        } catch (Exception e) {
            log.error("Failed to encode TCP/UDP message: {}", e.getMessage());
            return "{}".getBytes(StandardCharsets.UTF_8);
        }
    }

    /**
     * 处理 TCP 消息并发布到 Kafka
     */
    public void handleTcpMessage(String sessionId, TcpSessionInfo info, String message) {
        try {
            Map<String, String> headers = buildHeaders(sessionId, "TCP", info);
            ProtocolParseOutcome parseOutcome = protocolParseEngine.parse(
                    ProtocolParseEngine.buildContext(
                            "TCP_UDP",
                            "TCP",
                            "/tcp/data",
                            message.getBytes(StandardCharsets.UTF_8),
                            headers,
                            sessionId,
                            info != null ? info.getRemoteAddress() : null,
                            parseLong(headers.get("productId")),
                            headers.get("productKey")
                    ),
                    KnownDeviceContext.builder()
                            .tenantId(parseLong(headers.get("tenantId")))
                            .productId(parseLong(headers.get("productId")))
                            .deviceId(parseLong(headers.get("deviceId")))
                            .deviceName(headers.get("deviceName"))
                            .productKey(headers.get("productKey"))
                            .build()
            );
            if (parseOutcome.isHandled()) {
                parseOutcome.getMessages().forEach(messageProducer::publishUpstream);
                return;
            }
            DeviceMessage deviceMessage = decode("/tcp/data", message.getBytes(StandardCharsets.UTF_8), headers);
            if (deviceMessage != null) {
                messageProducer.publishUpstream(deviceMessage);
            }
        } catch (Exception e) {
            log.error("TCP 消息处理失败: session={}, error={}", sessionId, e.getMessage());
        }
    }

    /**
     * 处理 UDP 消息并发布到 Kafka
     */
    public void handleUdpMessage(String sender, UdpServer.UdpPeerInfo peerInfo, String message) {
        try {
            Map<String, String> headers = buildHeaders(sender, "UDP", peerInfo == null ? null : peerInfo.getBinding(), sender);

            ProtocolParseOutcome parseOutcome = protocolParseEngine.parse(
                    ProtocolParseEngine.buildContext(
                            "TCP_UDP",
                            "UDP",
                            "/udp/data",
                            message.getBytes(StandardCharsets.UTF_8),
                            headers,
                            sender,
                            sender,
                            parseLong(headers.get("productId")),
                            headers.get("productKey")
                    ),
                    KnownDeviceContext.builder()
                            .tenantId(parseLong(headers.get("tenantId")))
                            .productId(parseLong(headers.get("productId")))
                            .deviceId(parseLong(headers.get("deviceId")))
                            .deviceName(headers.get("deviceName"))
                            .productKey(headers.get("productKey"))
                            .build()
            );
            if (parseOutcome.isHandled()) {
                parseOutcome.getMessages().forEach(messageProducer::publishUpstream);
                return;
            }

            DeviceMessage deviceMessage = decode("/udp/data", message.getBytes(StandardCharsets.UTF_8), headers);
            if (deviceMessage != null) {
                messageProducer.publishUpstream(deviceMessage);
            }
        } catch (Exception e) {
            log.error("UDP 消息处理失败: sender={}, error={}", sender, e.getMessage());
        }
    }

    private Map<String, String> buildHeaders(String sessionId, String protocol, TcpSessionInfo info) {
        return buildHeaders(sessionId, protocol, info == null ? null : info.getBinding(), info != null ? info.getRemoteAddress() : null);
    }

    private Map<String, String> buildHeaders(String sessionId,
                                             String protocol,
                                             TcpUdpBindingContext binding,
                                             String remoteAddress) {
        Map<String, String> headers = new HashMap<>();
        headers.put("sessionId", sessionId != null ? sessionId : "");
        headers.put("protocol", protocol);
        headers.put("remoteAddress", remoteAddress != null ? remoteAddress : "");
        if (binding != null) {
            putIfPresent(headers, "tenantId", binding.getTenantId());
            putIfPresent(headers, "productId", binding.getProductId());
            putIfPresent(headers, "productKey", binding.getProductKey());
            putIfPresent(headers, "deviceId", binding.getDeviceId());
            putIfPresent(headers, "deviceName", binding.getDeviceName());
        }
        return headers;
    }

    private void putIfPresent(Map<String, String> headers, String key, Long value) {
        if (value != null) {
            headers.put(key, String.valueOf(value));
        }
    }

    private void putIfPresent(Map<String, String> headers, String key, String value) {
        if (value != null && !value.isBlank()) {
            headers.put(key, value);
        }
    }

    private String headerValue(Map<String, String> headers, String key) {
        return headers == null ? null : headers.get(key);
    }

    private Long parseLong(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
