package com.songhg.firefly.iot.connector.protocol.downstream;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.parser.model.DownlinkEncodeContext;
import com.songhg.firefly.iot.connector.parser.model.ProtocolEncodeOutcome;
import com.songhg.firefly.iot.connector.parser.service.ProtocolDownlinkEncodeService;
import com.songhg.firefly.iot.connector.protocol.MessageCodec;
import com.songhg.firefly.iot.connector.protocol.lorawan.LoRaWanServer;
import com.songhg.firefly.iot.connector.protocol.tcpudp.TcpServer;
import com.songhg.firefly.iot.connector.protocol.tcpudp.TcpSessionInfo;
import com.songhg.firefly.iot.connector.protocol.tcpudp.TcpUdpBindingContext;
import com.songhg.firefly.iot.connector.protocol.tcpudp.UdpServer;
import com.songhg.firefly.iot.connector.protocol.websocket.DeviceWebSocketHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class NonMqttDownstreamDispatcher {

    private final DeviceWebSocketHandler deviceWebSocketHandler;
    private final TcpServer tcpServer;
    private final UdpServer udpServer;
    private final LoRaWanServer loRaWanServer;
    private final ProtocolDownlinkEncodeService protocolDownlinkEncodeService;
    private final MessageCodec messageCodec;
    private final DeviceIdentityResolveService deviceIdentityResolveService;

    public boolean dispatch(DeviceMessage message) {
        if (message == null || message.getDeviceId() == null) {
            return false;
        }

        if (dispatchWebSocket(message)) {
            return true;
        }
        if (dispatchTcp(message)) {
            return true;
        }
        if (dispatchUdp(message)) {
            return true;
        }
        return dispatchLoRaWan(message);
    }

    private boolean dispatchWebSocket(DeviceMessage message) {
        List<DeviceWebSocketHandler.SessionInfo> sessions = deviceWebSocketHandler.listSessionsByDeviceId(message.getDeviceId());
        if (sessions.isEmpty()) {
            return false;
        }

        boolean delivered = false;
        for (DeviceWebSocketHandler.SessionInfo session : sessions) {
            ResolvedDeviceIdentity identity = ResolvedDeviceIdentity.builder()
                    .deviceId(session.getDeviceId())
                    .tenantId(session.getTenantId())
                    .productId(session.getProductId())
                    .productKey(session.getProductKey())
                    .deviceName(session.getDeviceName())
                    .build();
            Map<String, String> headers = new HashMap<>();
            putIfPresent(headers, "sessionId", session.getSessionId());
            putIfPresent(headers, "remoteAddress", session.getRemoteAddress());
            EncodedPayload payload = encodePayload(
                    message,
                    identity,
                    "WEBSOCKET",
                    "WEBSOCKET",
                    defaultTopic("ws", message.getDeviceId()),
                    headers,
                    session.getSessionId(),
                    session.getRemoteAddress()
            );
            if (payload.drop) {
                return true;
            }
            String textPayload = asTextPayload(payload.payload);
            if (textPayload == null) {
                log.warn("Skip WebSocket downstream because payload is not text: deviceId={}, sessionId={}",
                        message.getDeviceId(), session.getSessionId());
                continue;
            }
            if (deviceWebSocketHandler.sendMessage(session.getSessionId(), textPayload)) {
                delivered = true;
            }
        }
        return delivered;
    }

    private boolean dispatchTcp(DeviceMessage message) {
        List<TcpSessionInfo> sessions = tcpServer.listSessionsByDeviceId(message.getDeviceId());
        if (sessions.isEmpty()) {
            return false;
        }

        boolean delivered = false;
        for (TcpSessionInfo session : sessions) {
            TcpUdpBindingContext binding = session.getBinding();
            ResolvedDeviceIdentity identity = binding == null ? null : ResolvedDeviceIdentity.builder()
                    .deviceId(binding.getDeviceId())
                    .tenantId(binding.getTenantId())
                    .productId(binding.getProductId())
                    .productKey(binding.getProductKey())
                    .deviceName(binding.getDeviceName())
                    .build();
            Map<String, String> headers = new HashMap<>();
            putIfPresent(headers, "sessionId", session.getSessionId());
            putIfPresent(headers, "remoteAddress", session.getRemoteAddress());
            EncodedPayload payload = encodePayload(
                    message,
                    identity,
                    "TCP_UDP",
                    "TCP",
                    defaultTopic("tcp", message.getDeviceId()),
                    headers,
                    session.getSessionId(),
                    session.getRemoteAddress()
            );
            if (payload.drop) {
                return true;
            }
            boolean appendLineDelimiter = isTextPayload(payload.payload);
            if (tcpServer.sendToSession(session.getSessionId(), payload.payload, appendLineDelimiter)) {
                delivered = true;
            }
        }
        return delivered;
    }

    private boolean dispatchUdp(DeviceMessage message) {
        List<UdpServer.UdpPeerInfo> peers = udpServer.listPeersByDeviceId(message.getDeviceId());
        if (peers.isEmpty()) {
            return false;
        }

        boolean delivered = false;
        for (UdpServer.UdpPeerInfo peer : peers) {
            TcpUdpBindingContext binding = peer.getBinding();
            ResolvedDeviceIdentity identity = binding == null ? null : ResolvedDeviceIdentity.builder()
                    .deviceId(binding.getDeviceId())
                    .tenantId(binding.getTenantId())
                    .productId(binding.getProductId())
                    .productKey(binding.getProductKey())
                    .deviceName(binding.getDeviceName())
                    .build();
            String remoteAddress = peer.getAddress() + ":" + peer.getPort();
            Map<String, String> headers = new HashMap<>();
            putIfPresent(headers, "remoteAddress", remoteAddress);
            EncodedPayload payload = encodePayload(
                    message,
                    identity,
                    "TCP_UDP",
                    "UDP",
                    defaultTopic("udp", message.getDeviceId()),
                    headers,
                    remoteAddress,
                    remoteAddress
            );
            if (payload.drop) {
                return true;
            }
            if (udpServer.sendTo(peer.getAddress(), peer.getPort(), payload.payload)) {
                delivered = true;
            }
        }
        return delivered;
    }

    private boolean dispatchLoRaWan(DeviceMessage message) {
        ResolvedDeviceIdentity identity = deviceIdentityResolveService.loadByDeviceId(message.getDeviceId());
        Optional<String> devEuiOptional = deviceIdentityResolveService.resolveLoRaDevEui(identity, loRaWanServer.listDevices());
        if (devEuiOptional.isEmpty()) {
            return false;
        }

        String devEui = devEuiOptional.get();
        Map<String, String> headers = new HashMap<>();
        putIfPresent(headers, "devEui", devEui);
        EncodedPayload payload = encodePayload(
                message,
                identity,
                "LORAWAN",
                "LORAWAN",
                "/lorawan/downlink/" + devEui,
                headers,
                devEui,
                devEui
        );
        if (payload.drop) {
            return true;
        }

        String payloadText = asTextPayload(payload.payload);
        String encodedData = payloadText != null
                ? payloadText
                : Base64.getEncoder().encodeToString(payload.payload);
        String displayPayload = payloadText != null
                ? payloadText
                : "base64:" + encodedData;
        Integer fPort = parseInteger(resolveHeaderValue(payload.headers, message.getPayload(), "fPort", "_fPort"));
        Boolean confirmed = parseBoolean(resolveHeaderValue(payload.headers, message.getPayload(), "confirmed", "_confirmed"));
        return loRaWanServer.queueDownlink(devEui, fPort, encodedData, confirmed, displayPayload, message);
    }

    private EncodedPayload encodePayload(DeviceMessage message,
                                         ResolvedDeviceIdentity identity,
                                         String protocol,
                                         String transport,
                                         String defaultTopic,
                                         Map<String, String> headers,
                                         String sessionId,
                                         String remoteAddress) {
        ProtocolEncodeOutcome encodeOutcome = protocolDownlinkEncodeService.encode(
                DownlinkEncodeContext.builder()
                        .protocol(protocol)
                        .transport(transport)
                        .topic(message.getTopic() == null || message.getTopic().isBlank() ? defaultTopic : message.getTopic())
                        .messageType(message.getType() == null ? null : message.getType().name())
                        .messageId(message.getMessageId())
                        .payload(message.getPayload())
                        .timestamp(message.getTimestamp())
                        .tenantId(identity == null ? message.getTenantId() : firstNonNull(identity.getTenantId(), message.getTenantId()))
                        .productId(identity == null ? message.getProductId() : firstNonNull(identity.getProductId(), message.getProductId()))
                        .productKey(identity == null ? null : identity.getProductKey())
                        .deviceId(identity == null ? message.getDeviceId() : firstNonNull(identity.getDeviceId(), message.getDeviceId()))
                        .deviceName(identity == null ? message.getDeviceName() : firstNonBlank(identity.getDeviceName(), message.getDeviceName()))
                        .headers(headers)
                        .sessionId(sessionId)
                        .remoteAddress(remoteAddress)
                        .build()
        );

        if (encodeOutcome.isDrop()) {
            log.info("Downstream message dropped by custom encoder: deviceId={}, protocol={}, transport={}",
                    message.getDeviceId(), protocol, transport);
            return EncodedPayload.drop();
        }

        byte[] payload = encodeOutcome.isHandled() ? encodeOutcome.getPayload() : messageCodec.encodeJson(message);
        return new EncodedPayload(payload, encodeOutcome.getHeaders(), false);
    }

    private String resolveHeaderValue(Map<String, String> headers,
                                      Map<String, Object> payload,
                                      String headerKey,
                                      String payloadKey) {
        String headerValue = headers == null ? null : trimToNull(headers.get(headerKey));
        if (headerValue != null) {
            return headerValue;
        }
        if (payload == null || payload.isEmpty()) {
            return null;
        }
        Object payloadValue = payload.get(payloadKey);
        return payloadValue == null ? null : trimToNull(String.valueOf(payloadValue));
    }

    private Long firstNonNull(Long left, Long right) {
        return left != null ? left : right;
    }

    private String firstNonBlank(String left, String right) {
        String normalizedLeft = trimToNull(left);
        return normalizedLeft != null ? normalizedLeft : trimToNull(right);
    }

    private String defaultTopic(String transport, Long deviceId) {
        return "/" + transport + "/downstream/" + deviceId;
    }

    private String asTextPayload(byte[] payload) {
        if (!isTextPayload(payload)) {
            return null;
        }
        return new String(payload, StandardCharsets.UTF_8);
    }

    private boolean isTextPayload(byte[] payload) {
        if (payload == null || payload.length == 0) {
            return true;
        }
        String text = new String(payload, StandardCharsets.UTF_8);
        int printable = 0;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == '\uFFFD') {
                return false;
            }
            if (Character.isISOControl(ch) && !Character.isWhitespace(ch)) {
                continue;
            }
            printable++;
        }
        return printable * 10 >= text.length() * 8;
    }

    private Integer parseInteger(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return null;
        }
        try {
            return Integer.parseInt(normalized);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private Boolean parseBoolean(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return null;
        }
        if ("true".equalsIgnoreCase(normalized) || "1".equals(normalized)) {
            return true;
        }
        if ("false".equalsIgnoreCase(normalized) || "0".equals(normalized)) {
            return false;
        }
        return null;
    }

    private void putIfPresent(Map<String, String> target, String key, String value) {
        String normalized = trimToNull(value);
        if (normalized != null) {
            target.put(key, normalized);
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static final class EncodedPayload {
        private final byte[] payload;
        private final Map<String, String> headers;
        private final boolean drop;

        private EncodedPayload(byte[] payload, Map<String, String> headers, boolean drop) {
            this.payload = payload == null ? new byte[0] : payload;
            this.headers = headers == null ? Map.of() : headers;
            this.drop = drop;
        }

        private static EncodedPayload drop() {
            return new EncodedPayload(new byte[0], Map.of(), true);
        }
    }
}
