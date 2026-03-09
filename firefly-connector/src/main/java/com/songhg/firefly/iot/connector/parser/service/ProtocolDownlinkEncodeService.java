package com.songhg.firefly.iot.connector.parser.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.connector.parser.executor.ScriptParserExecutor;
import com.songhg.firefly.iot.connector.parser.model.DownlinkEncodeContext;
import com.songhg.firefly.iot.connector.parser.model.EncodeExecutionResult;
import com.songhg.firefly.iot.connector.parser.model.ProtocolEncodeOutcome;
import com.songhg.firefly.iot.connector.parser.support.PayloadCodec;
import com.songhg.firefly.iot.plugin.protocol.ProtocolParserPlugin;
import com.songhg.firefly.iot.plugin.protocol.ProtocolPluginEncodeContext;
import com.songhg.firefly.iot.plugin.protocol.ProtocolPluginEncodeResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProtocolDownlinkEncodeService {

    private final ObjectMapper objectMapper;
    private final PublishedProtocolParserService publishedProtocolParserService;
    private final ScriptParserExecutor scriptParserExecutor;
    private final ProtocolParserMatcher protocolParserMatcher;
    private final ProtocolParserPluginRegistry pluginRegistry;
    private final ProtocolParserMetricsService metricsService;
    private final ProtocolParserReleaseMatcher releaseMatcher;

    public ProtocolEncodeOutcome encode(DownlinkEncodeContext context) {
        long start = System.currentTimeMillis();
        if (context == null || context.getProductId() == null) {
            metricsService.recordEncode(context == null ? null : context.getTransport(), null, false, true, System.currentTimeMillis() - start);
            return ProtocolEncodeOutcome.notHandled();
        }

        List<ProtocolParserPublishedDTO> candidates = publishedProtocolParserService.getPublishedDefinitions(context.getProductId());
        if (candidates.isEmpty()) {
            metricsService.recordEncode(context.getTransport(), null, false, true, System.currentTimeMillis() - start);
            return ProtocolEncodeOutcome.notHandled();
        }

        for (ProtocolParserPublishedDTO definition : candidates) {
            if (!protocolParserMatcher.matchesDownlink(definition, context)) {
                continue;
            }
            if (!releaseMatcher.matches(definition, context.getDeviceId(), context.getDeviceName(), context.getProductKey())) {
                continue;
            }
            try {
                DownlinkEncodeContext effectiveContext = enrichContext(context, definition);
                EncodeExecutionResult result = execute(definition, effectiveContext);
                if (result == null) {
                    continue;
                }
                if (result.isDrop()) {
                    metricsService.recordEncode(context.getTransport(), definition.getParserMode(), true, true, System.currentTimeMillis() - start);
                    return ProtocolEncodeOutcome.dropped(definition.getParserMode());
                }
                byte[] payload = resolvePayload(result);
                String topic = firstNotBlank(result.getTopic(), context.getTopic());
                metricsService.recordEncode(context.getTransport(), definition.getParserMode(), true, true, System.currentTimeMillis() - start);
                return ProtocolEncodeOutcome.handled(topic, payload, result.getHeaders(), definition.getParserMode());
            } catch (Exception ex) {
                log.warn("Custom encoder execution failed: productId={}, definitionId={}, error={}",
                        context.getProductId(), definition.getDefinitionId(), ex.getMessage());
                metricsService.recordEncode(context.getTransport(), definition.getParserMode(), true, false, System.currentTimeMillis() - start);
                return ProtocolEncodeOutcome.dropped(definition.getParserMode());
            }
        }

        metricsService.recordEncode(context.getTransport(), null, false, true, System.currentTimeMillis() - start);
        return ProtocolEncodeOutcome.notHandled();
    }

    public ProtocolEncodeOutcome debugEncode(ProtocolParserPublishedDTO definition, DownlinkEncodeContext context) {
        if (definition == null || context == null) {
            return ProtocolEncodeOutcome.notHandled();
        }
        DownlinkEncodeContext effectiveContext = enrichContext(context, definition);
        EncodeExecutionResult result = execute(definition, effectiveContext);
        if (result == null) {
            return ProtocolEncodeOutcome.notHandled();
        }
        if (result.isDrop()) {
            return ProtocolEncodeOutcome.dropped(definition.getParserMode());
        }
        return ProtocolEncodeOutcome.handled(
                firstNotBlank(result.getTopic(), context.getTopic()),
                resolvePayload(result),
                result.getHeaders(),
                definition.getParserMode()
        );
    }

    private EncodeExecutionResult execute(ProtocolParserPublishedDTO definition, DownlinkEncodeContext context) {
        String parserMode = upper(definition.getParserMode());
        if ("SCRIPT".equals(parserMode)) {
            return scriptParserExecutor.encode(definition, context);
        }
        if ("PLUGIN".equals(parserMode)) {
            ProtocolParserPlugin plugin = pluginRegistry.find(definition.getPluginId(), definition.getPluginVersion());
            if (plugin == null || !plugin.supportsEncode()) {
                throw new IllegalStateException("Plugin encoder is not available");
            }
            return convertPluginResult(plugin.encode(toPluginContext(context)));
        }
        log.debug("Unsupported encoder mode: definitionId={}, parserMode={}", definition.getDefinitionId(), definition.getParserMode());
        return null;
    }

    private DownlinkEncodeContext enrichContext(DownlinkEncodeContext context, ProtocolParserPublishedDTO definition) {
        Map<String, Object> config = readJsonMap(definition.getParserConfigJson());
        if (!config.containsKey("productId")) {
            config.put("productId", context.getProductId());
        }
        if (!config.containsKey("productKey") && context.getProductKey() != null) {
            config.put("productKey", context.getProductKey());
        }
        return DownlinkEncodeContext.builder()
                .protocol(context.getProtocol())
                .transport(context.getTransport())
                .topic(context.getTopic())
                .messageType(context.getMessageType())
                .messageId(context.getMessageId())
                .payload(context.getPayload())
                .timestamp(context.getTimestamp())
                .tenantId(context.getTenantId())
                .productId(context.getProductId())
                .productKey(context.getProductKey())
                .deviceId(context.getDeviceId())
                .deviceName(context.getDeviceName())
                .headers(context.getHeaders())
                .sessionId(context.getSessionId())
                .remoteAddress(context.getRemoteAddress())
                .config(config)
                .build();
    }

    private ProtocolPluginEncodeContext toPluginContext(DownlinkEncodeContext context) {
        return ProtocolPluginEncodeContext.builder()
                .protocol(context.getProtocol())
                .transport(context.getTransport())
                .topic(context.getTopic())
                .messageType(context.getMessageType())
                .messageId(context.getMessageId())
                .payload(context.getPayload())
                .timestamp(context.getTimestamp())
                .tenantId(context.getTenantId())
                .productId(context.getProductId())
                .productKey(context.getProductKey())
                .deviceId(context.getDeviceId())
                .deviceName(context.getDeviceName())
                .headers(context.getHeaders())
                .sessionId(context.getSessionId())
                .remoteAddress(context.getRemoteAddress())
                .config(context.getConfig())
                .build();
    }

    private EncodeExecutionResult convertPluginResult(ProtocolPluginEncodeResult pluginResult) {
        if (pluginResult == null) {
            return null;
        }
        EncodeExecutionResult result = new EncodeExecutionResult();
        result.setDrop(pluginResult.isDrop());
        result.setTopic(pluginResult.getTopic());
        result.setPayloadText(pluginResult.getPayloadText());
        result.setPayloadHex(pluginResult.getPayloadHex());
        result.setPayloadBase64(pluginResult.getPayloadBase64());
        result.setPayloadJson(pluginResult.getPayloadJson());
        result.setHeaders(pluginResult.getHeaders());
        if (pluginResult.getPayload() != null) {
            result.setPayloadBytes(toByteList(pluginResult.getPayload()));
        }
        return result;
    }

    private List<Integer> toByteList(byte[] payload) {
        List<Integer> values = new java.util.ArrayList<>(payload.length);
        for (byte value : payload) {
            values.add(value & 0xFF);
        }
        return values;
    }

    private byte[] resolvePayload(EncodeExecutionResult result) {
        if (result.getPayloadBytes() != null && !result.getPayloadBytes().isEmpty()) {
            byte[] payload = new byte[result.getPayloadBytes().size()];
            for (int i = 0; i < result.getPayloadBytes().size(); i++) {
                payload[i] = (byte) (result.getPayloadBytes().get(i) & 0xFF);
            }
            return payload;
        }
        if (result.getPayloadHex() != null && !result.getPayloadHex().isBlank()) {
            return PayloadCodec.decodeHex(result.getPayloadHex());
        }
        if (result.getPayloadBase64() != null && !result.getPayloadBase64().isBlank()) {
            return Base64.getDecoder().decode(result.getPayloadBase64());
        }
        if (result.getPayloadJson() != null && !result.getPayloadJson().isEmpty()) {
            try {
                return objectMapper.writeValueAsBytes(result.getPayloadJson());
            } catch (Exception ex) {
                throw new IllegalStateException("Failed to serialize payloadJson", ex);
            }
        }
        return result.getPayloadText() == null ? new byte[0] : result.getPayloadText().getBytes(StandardCharsets.UTF_8);
    }

    private Map<String, Object> readJsonMap(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception ex) {
            return new LinkedHashMap<>();
        }
    }

    private String firstNotBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private String upper(String value) {
        return value == null ? null : value.trim().toUpperCase(Locale.ROOT);
    }
}
