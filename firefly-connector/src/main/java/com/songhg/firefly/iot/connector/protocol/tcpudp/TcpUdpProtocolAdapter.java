package com.songhg.firefly.iot.connector.protocol.tcpudp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.DeviceLocatorInputDTO;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.protocol.downstream.DeviceIdentityResolveService;
import com.songhg.firefly.iot.connector.protocol.downstream.ResolvedDeviceIdentity;
import com.songhg.firefly.iot.connector.parser.model.FrameDecodeResult;
import com.songhg.firefly.iot.connector.parser.model.KnownDeviceContext;
import com.songhg.firefly.iot.connector.parser.model.ParseContext;
import com.songhg.firefly.iot.connector.parser.model.ProtocolParseOutcome;
import com.songhg.firefly.iot.connector.parser.service.FrameDecodeEngine;
import com.songhg.firefly.iot.connector.parser.service.ProtocolParseEngine;
import com.songhg.firefly.iot.connector.parser.support.PayloadCodec;
import com.songhg.firefly.iot.connector.protocol.ProtocolAdapter;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class TcpUdpProtocolAdapter implements ProtocolAdapter {

    private final ObjectMapper objectMapper;
    private final DeviceMessageProducer messageProducer;
    private final ProtocolParseEngine protocolParseEngine;
    private final FrameDecodeEngine frameDecodeEngine;
    private final DeviceIdentityResolveService deviceIdentityResolveService;

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
            String payloadText = new String(payload, StandardCharsets.UTF_8);
            String trimmedPayload = payloadText.trim();

            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> parsed = objectMapper.readValue(trimmedPayload, LinkedHashMap.class);
                data = parsed;
            } catch (Exception ex) {
                data = new LinkedHashMap<>();
                if (isPrintable(payloadText)) {
                    data.put("raw", trimmedPayload);
                } else {
                    data.put("rawHex", PayloadCodec.toHex(payload));
                }
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
        } catch (Exception ex) {
            log.error("Failed to decode TCP/UDP payload: {}", ex.getMessage());
            return null;
        }
    }

    @Override
    public byte[] encode(DeviceMessage message) {
        try {
            return objectMapper.writeValueAsBytes(message.getPayload());
        } catch (Exception ex) {
            log.error("Failed to encode TCP/UDP message: {}", ex.getMessage());
            return "{}".getBytes(StandardCharsets.UTF_8);
        }
    }

    public void handleTcpMessage(String sessionId, TcpSessionInfo info, String message) {
        handleTcpMessage(sessionId, info, message == null ? new byte[0] : message.getBytes(StandardCharsets.UTF_8));
    }

    public void handleTcpMessage(String sessionId, TcpSessionInfo info, byte[] payload) {
        try {
            // The simulator sends one reserved binding frame right after connect so
            // downstream routing can resolve this raw socket back to a platform device.
            if (tryBootstrapBinding(payload, binding -> {
                if (info != null) {
                    info.setBinding(binding);
                }
            }, "TCP", sessionId, info != null ? info.getRemoteAddress() : null)) {
                return;
            }
            Map<String, String> headers = buildHeaders(sessionId, "TCP", info);
            KnownDeviceContext knownDeviceContext = buildKnownDeviceContext(headers);
            ParseContext rawContext = buildParseContext(
                    "TCP",
                    "/tcp/data",
                    payload,
                    headers,
                    sessionId,
                    info != null ? info.getRemoteAddress() : null
            );
            FrameDecodeResult frameDecodeResult = frameDecodeEngine.decode(rawContext, knownDeviceContext);
            if (frameDecodeResult.isNeedMoreData() && frameDecodeResult.getFrames().isEmpty()) {
                return;
            }
            for (byte[] frame : frameDecodeResult.getFrames()) {
                processInboundFrame("/tcp/data", "TCP", frame, headers, sessionId,
                        info != null ? info.getRemoteAddress() : null, knownDeviceContext);
            }
        } catch (Exception ex) {
            log.error("TCP payload handling failed: session={}, error={}", sessionId, ex.getMessage());
        }
    }

    public void handleUdpMessage(String sender, UdpServer.UdpPeerInfo peerInfo, String message) {
        handleUdpMessage(sender, peerInfo, message == null ? new byte[0] : message.getBytes(StandardCharsets.UTF_8));
    }

    public void handleUdpMessage(String sender, UdpServer.UdpPeerInfo peerInfo, byte[] payload) {
        try {
            // UDP uses the same reserved binding frame because there is no long-lived
            // application-layer session handshake we can rely on from the protocol itself.
            if (tryBootstrapBinding(payload, binding -> {
                if (peerInfo != null) {
                    peerInfo.setBinding(binding);
                }
            }, "UDP", sender, sender)) {
                return;
            }
            Map<String, String> headers = buildHeaders(sender, "UDP", peerInfo == null ? null : peerInfo.getBinding(), sender);
            KnownDeviceContext knownDeviceContext = buildKnownDeviceContext(headers);
            processInboundFrame("/udp/data", "UDP", payload, headers, sender, sender, knownDeviceContext);
        } catch (Exception ex) {
            log.error("UDP payload handling failed: sender={}, error={}", sender, ex.getMessage());
        }
    }

    private void processInboundFrame(String topic,
                                     String transport,
                                     byte[] payload,
                                     Map<String, String> headers,
                                     String sessionId,
                                     String remoteAddress,
                                     KnownDeviceContext knownDeviceContext) {
        ParseContext parseContext = buildParseContext(transport, topic, payload, headers, sessionId, remoteAddress);
        ProtocolParseOutcome parseOutcome = protocolParseEngine.parse(parseContext, knownDeviceContext);
        if (parseOutcome.isHandled()) {
            parseOutcome.getMessages().forEach(messageProducer::publishUpstream);
            return;
        }
        DeviceMessage fallback = decode(topic, payload, headers);
        if (fallback != null) {
            messageProducer.publishUpstream(fallback);
        }
    }

    private ParseContext buildParseContext(String transport,
                                           String topic,
                                           byte[] payload,
                                           Map<String, String> headers,
                                           String sessionId,
                                           String remoteAddress) {
        return ProtocolParseEngine.buildContext(
                "TCP_UDP",
                transport,
                topic,
                payload,
                headers,
                sessionId,
                remoteAddress,
                parseLong(headers.get("productId")),
                headers.get("productKey")
        );
    }

    private KnownDeviceContext buildKnownDeviceContext(Map<String, String> headers) {
        return KnownDeviceContext.builder()
                .tenantId(parseLong(headers.get("tenantId")))
                .productId(parseLong(headers.get("productId")))
                .deviceId(parseLong(headers.get("deviceId")))
                .deviceName(headers.get("deviceName"))
                .productKey(headers.get("productKey"))
                .build();
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

    private boolean isPrintable(String payload) {
        if (payload == null || payload.isEmpty()) {
            return true;
        }
        int printable = 0;
        for (int i = 0; i < payload.length(); i++) {
            char ch = payload.charAt(i);
            if (Character.isISOControl(ch) && !Character.isWhitespace(ch)) {
                continue;
            }
            printable++;
        }
        return printable * 10 >= payload.length() * 8;
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

    private boolean tryBootstrapBinding(byte[] payload,
                                        java.util.function.Consumer<TcpUdpBindingContext> bindingConsumer,
                                        String protocol,
                                        String sessionId,
                                        String remoteAddress) {
        Map<String, Object> bindingPayload = readBindingPayload(payload);
        if (bindingPayload == null) {
            return false;
        }

        String productKey = textValue(bindingPayload.get("productKey"));
        String deviceName = textValue(bindingPayload.get("deviceName"));
        List<DeviceLocatorInputDTO> locators = readLocatorInputs(bindingPayload.get("locators"));
        ResolvedDeviceIdentity resolvedIdentity = deviceIdentityResolveService.resolveByProductKey(productKey, deviceName, locators);
        if (resolvedIdentity == null || resolvedIdentity.getDeviceId() == null) {
            log.warn("Skip {} bootstrap binding because device identity cannot be resolved: sessionId={}, remoteAddress={}, productKey={}",
                    protocol, sessionId, remoteAddress, productKey);
            return true;
        }

        bindingConsumer.accept(TcpUdpBindingContext.builder()
                .tenantId(resolvedIdentity.getTenantId())
                .productId(resolvedIdentity.getProductId())
                .productKey(productKey != null ? productKey : resolvedIdentity.getProductKey())
                .deviceId(resolvedIdentity.getDeviceId())
                .deviceName(resolvedIdentity.getDeviceName())
                .bindTime(System.currentTimeMillis())
                .build());
        log.info("{} bootstrap binding established: sessionId={}, remoteAddress={}, deviceId={}, deviceName={}",
                protocol, sessionId, remoteAddress, resolvedIdentity.getDeviceId(), resolvedIdentity.getDeviceName());
        return true;
    }

    private Map<String, Object> readBindingPayload(byte[] payload) {
        if (payload == null || payload.length == 0) {
            return null;
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(payload, LinkedHashMap.class);
            Object binding = parsed.get("_fireflyBinding");
            if (!(binding instanceof Map<?, ?> bindingMap)) {
                return null;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> converted = objectMapper.convertValue(bindingMap, LinkedHashMap.class);
            return converted;
        } catch (Exception ex) {
            return null;
        }
    }

    private List<DeviceLocatorInputDTO> readLocatorInputs(Object rawLocators) {
        if (rawLocators == null) {
            return List.of();
        }
        try {
            DeviceLocatorInputDTO[] locators = objectMapper.convertValue(rawLocators, DeviceLocatorInputDTO[].class);
            return locators == null ? List.of() : Arrays.asList(locators);
        } catch (IllegalArgumentException ex) {
            return List.of();
        }
    }

    private String textValue(Object rawValue) {
        if (rawValue == null) {
            return null;
        }
        String text = String.valueOf(rawValue).trim();
        return text.isEmpty() ? null : text;
    }
}
