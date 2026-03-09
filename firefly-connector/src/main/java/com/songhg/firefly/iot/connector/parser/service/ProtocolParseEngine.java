package com.songhg.firefly.iot.connector.parser.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.parser.executor.ScriptParserExecutor;
import com.songhg.firefly.iot.connector.parser.model.KnownDeviceContext;
import com.songhg.firefly.iot.connector.parser.model.ParseContext;
import com.songhg.firefly.iot.connector.parser.model.ParseExecutionResult;
import com.songhg.firefly.iot.connector.parser.model.ParsedMessage;
import com.songhg.firefly.iot.connector.parser.model.ProtocolParseOutcome;
import com.songhg.firefly.iot.connector.parser.model.ResolvedDeviceContext;
import com.songhg.firefly.iot.connector.parser.support.PayloadCodec;
import com.songhg.firefly.iot.plugin.protocol.ProtocolParserPlugin;
import com.songhg.firefly.iot.plugin.protocol.ProtocolPluginMessage;
import com.songhg.firefly.iot.plugin.protocol.ProtocolPluginParseResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProtocolParseEngine {

    private static final String DEFAULT_DIRECTION = "UPLINK";

    private final ObjectMapper objectMapper;
    private final PublishedProtocolParserService publishedProtocolParserService;
    private final DeviceIdentityResolveService deviceIdentityResolveService;
    private final ScriptParserExecutor scriptParserExecutor;
    private final ProtocolParserMatcher protocolParserMatcher;
    private final ProtocolParserPluginRegistry pluginRegistry;
    private final ProtocolParserMetricsService metricsService;
    private final ProtocolParserReleaseMatcher releaseMatcher;

    public ProtocolParseOutcome parse(ParseContext parseContext, KnownDeviceContext knownDeviceContext) {
        long start = System.currentTimeMillis();
        Long productId = parseContext.getProductId() != null
                ? parseContext.getProductId()
                : knownDeviceContext == null ? null : knownDeviceContext.getProductId();
        if (productId == null) {
            metricsService.recordParse(parseContext.getTransport(), null, false, true, System.currentTimeMillis() - start);
            return ProtocolParseOutcome.notHandled();
        }

        List<ProtocolParserPublishedDTO> candidates = publishedProtocolParserService.getPublishedDefinitions(productId);
        if (candidates.isEmpty()) {
            metricsService.recordParse(parseContext.getTransport(), null, false, true, System.currentTimeMillis() - start);
            return ProtocolParseOutcome.notHandled();
        }

        for (ProtocolParserPublishedDTO definition : candidates) {
            if (!protocolParserMatcher.matches(definition, parseContext, DEFAULT_DIRECTION)) {
                continue;
            }
            try {
                ParseContext effectiveContext = enrichContext(parseContext, definition, productId, knownDeviceContext);
                ParseExecutionResult executionResult = execute(definition, effectiveContext);
                if (executionResult == null) {
                    continue;
                }
                if (executionResult.isDrop() || executionResult.isNeedMoreData()) {
                    metricsService.recordParse(parseContext.getTransport(), definition.getParserMode(), true, true, System.currentTimeMillis() - start);
                    return ProtocolParseOutcome.handled(List.of());
                }

                ResolvedDeviceContext resolvedDeviceContext = deviceIdentityResolveService.resolve(
                        effectiveContext,
                        knownDeviceContext,
                        executionResult.getIdentity()
                );
                if (resolvedDeviceContext == null) {
                    log.warn("Custom parser matched but device identity unresolved: productId={}, definitionId={}",
                            productId, definition.getDefinitionId());
                    metricsService.recordParse(parseContext.getTransport(), definition.getParserMode(), true, true, System.currentTimeMillis() - start);
                    return ProtocolParseOutcome.handled(List.of());
                }
                if (!releaseMatcher.matches(definition, resolvedDeviceContext)) {
                    continue;
                }

                List<DeviceMessage> messages = normalizeMessages(
                        executionResult.getMessages(),
                        effectiveContext,
                        resolvedDeviceContext
                );
                metricsService.recordParse(parseContext.getTransport(), definition.getParserMode(), true, true, System.currentTimeMillis() - start);
                return ProtocolParseOutcome.handled(messages);
            } catch (Exception ex) {
                log.warn("Custom parser execution failed: productId={}, definitionId={}, error={}",
                        productId, definition.getDefinitionId(), ex.getMessage());
                metricsService.recordParse(parseContext.getTransport(), definition.getParserMode(), true, false, System.currentTimeMillis() - start);
                return ProtocolParseOutcome.handled(List.of());
            }
        }

        metricsService.recordParse(parseContext.getTransport(), null, false, true, System.currentTimeMillis() - start);
        return ProtocolParseOutcome.notHandled();
    }

    public static ParseContext buildContext(String protocol,
                                            String transport,
                                            String topic,
                                            byte[] payload,
                                            Map<String, String> headers,
                                            String sessionId,
                                            String remoteAddress,
                                            Long productId,
                                            String productKey) {
        byte[] actualPayload = payload == null ? new byte[0] : payload;
        return ParseContext.builder()
                .protocol(protocol)
                .transport(transport)
                .topic(topic)
                .payload(actualPayload)
                .payloadText(new String(actualPayload, StandardCharsets.UTF_8))
                .payloadHex(PayloadCodec.toHex(actualPayload))
                .headers(headers == null ? Map.of() : headers)
                .sessionId(sessionId)
                .remoteAddress(remoteAddress)
                .productId(productId)
                .productKey(productKey)
                .build();
    }

    private ParseExecutionResult execute(ProtocolParserPublishedDTO definition, ParseContext parseContext) {
        String parserMode = upper(definition.getParserMode());
        if ("SCRIPT".equals(parserMode)) {
            return scriptParserExecutor.execute(definition, parseContext);
        }
        if ("PLUGIN".equals(parserMode)) {
            ProtocolParserPlugin plugin = pluginRegistry.find(definition.getPluginId(), definition.getPluginVersion());
            if (plugin == null || !plugin.supportsParse()) {
                throw new IllegalStateException("Plugin parser is not available");
            }
            return convertPluginResult(plugin.parse(toPluginContext(parseContext)));
        }
        log.debug("Unsupported parser mode for now: definitionId={}, parserMode={}",
                definition.getDefinitionId(), definition.getParserMode());
        return null;
    }

    private com.songhg.firefly.iot.plugin.protocol.ProtocolPluginParseContext toPluginContext(ParseContext parseContext) {
        return com.songhg.firefly.iot.plugin.protocol.ProtocolPluginParseContext.builder()
                .protocol(parseContext.getProtocol())
                .transport(parseContext.getTransport())
                .topic(parseContext.getTopic())
                .payload(parseContext.getPayload())
                .payloadText(parseContext.getPayloadText())
                .payloadHex(parseContext.getPayloadHex())
                .headers(parseContext.getHeaders())
                .sessionId(parseContext.getSessionId())
                .remoteAddress(parseContext.getRemoteAddress())
                .productId(parseContext.getProductId())
                .productKey(parseContext.getProductKey())
                .config(parseContext.getConfig())
                .build();
    }

    private ParseExecutionResult convertPluginResult(ProtocolPluginParseResult pluginResult) {
        if (pluginResult == null) {
            return null;
        }
        ParseExecutionResult result = new ParseExecutionResult();
        result.setDrop(pluginResult.isDrop());
        result.setNeedMoreData(pluginResult.isNeedMoreData());
        if (pluginResult.getIdentity() != null) {
            var identity = new com.songhg.firefly.iot.connector.parser.model.ParsedDeviceIdentity();
            identity.setMode(pluginResult.getIdentity().getMode());
            identity.setProductKey(pluginResult.getIdentity().getProductKey());
            identity.setDeviceName(pluginResult.getIdentity().getDeviceName());
            identity.setLocatorType(pluginResult.getIdentity().getLocatorType());
            identity.setLocatorValue(pluginResult.getIdentity().getLocatorValue());
            result.setIdentity(identity);
        }
        if (pluginResult.getMessages() != null) {
            result.setMessages(pluginResult.getMessages().stream().map(this::convertPluginMessage).toList());
        }
        return result;
    }

    private ParsedMessage convertPluginMessage(ProtocolPluginMessage pluginMessage) {
        ParsedMessage message = new ParsedMessage();
        message.setMessageId(pluginMessage.getMessageId());
        message.setType(pluginMessage.getType());
        message.setTopic(pluginMessage.getTopic());
        message.setPayload(pluginMessage.getPayload());
        message.setTimestamp(pluginMessage.getTimestamp());
        message.setDeviceName(pluginMessage.getDeviceName());
        return message;
    }

    private ParseContext enrichContext(ParseContext parseContext,
                                       ProtocolParserPublishedDTO definition,
                                       Long productId,
                                       KnownDeviceContext knownDeviceContext) {
        Map<String, Object> config = readJsonMap(definition.getParserConfigJson());
        if (!config.containsKey("productKey") && knownDeviceContext != null && knownDeviceContext.getProductKey() != null) {
            config.put("productKey", knownDeviceContext.getProductKey());
        }
        if (!config.containsKey("productId")) {
            config.put("productId", productId);
        }
        return ParseContext.builder()
                .protocol(parseContext.getProtocol())
                .transport(parseContext.getTransport())
                .topic(parseContext.getTopic())
                .payload(parseContext.getPayload())
                .payloadText(parseContext.getPayloadText())
                .payloadHex(parseContext.getPayloadHex())
                .headers(parseContext.getHeaders())
                .sessionId(parseContext.getSessionId())
                .remoteAddress(parseContext.getRemoteAddress())
                .productId(productId)
                .productKey(firstNotBlank(
                        parseContext.getProductKey(),
                        knownDeviceContext == null ? null : knownDeviceContext.getProductKey(),
                        asString(config.get("productKey"))))
                .config(config)
                .build();
    }

    private List<DeviceMessage> normalizeMessages(List<ParsedMessage> parsedMessages,
                                                  ParseContext parseContext,
                                                  ResolvedDeviceContext resolvedDeviceContext) {
        if (parsedMessages == null || parsedMessages.isEmpty()) {
            return List.of();
        }
        List<DeviceMessage> messages = new ArrayList<>(parsedMessages.size());
        for (ParsedMessage parsedMessage : parsedMessages) {
            DeviceMessage message = DeviceMessage.builder()
                    .messageId(parsedMessage.getMessageId())
                    .tenantId(resolvedDeviceContext.getTenantId())
                    .productId(resolvedDeviceContext.getProductId())
                    .deviceId(resolvedDeviceContext.getDeviceId())
                    .deviceName(firstNotBlank(parsedMessage.getDeviceName(), resolvedDeviceContext.getDeviceName()))
                    .type(parseMessageType(parsedMessage.getType()))
                    .topic(firstNotBlank(parsedMessage.getTopic(), parseContext.getTopic()))
                    .payload(parsedMessage.getPayload() == null ? Map.of() : new LinkedHashMap<>(parsedMessage.getPayload()))
                    .timestamp(parsedMessage.getTimestamp() == null ? System.currentTimeMillis() : parsedMessage.getTimestamp())
                    .build();
            messages.add(message);
        }
        return messages;
    }

    private DeviceMessage.MessageType parseMessageType(String type) {
        if (type == null || type.isBlank()) {
            return DeviceMessage.MessageType.RAW_DATA;
        }
        try {
            return DeviceMessage.MessageType.valueOf(type.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return DeviceMessage.MessageType.RAW_DATA;
        }
    }

    private Map<String, Object> readJsonMap(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception ex) {
            log.warn("Parse JSON config failed: {}", ex.getMessage());
            return new LinkedHashMap<>();
        }
    }

    private String upper(String value) {
        return value == null ? null : value.trim().toUpperCase(Locale.ROOT);
    }

    private boolean safeEquals(String left, String right) {
        return left == null ? right == null : left.equals(right);
    }

    private String asString(Object value) {
        return value == null ? null : value.toString();
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
}
