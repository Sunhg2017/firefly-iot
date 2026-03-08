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

    public ProtocolParseOutcome parse(ParseContext parseContext, KnownDeviceContext knownDeviceContext) {
        Long productId = parseContext.getProductId() != null
                ? parseContext.getProductId()
                : knownDeviceContext == null ? null : knownDeviceContext.getProductId();
        if (productId == null) {
            return ProtocolParseOutcome.notHandled();
        }

        List<ProtocolParserPublishedDTO> candidates = publishedProtocolParserService.getPublishedDefinitions(productId);
        if (candidates.isEmpty()) {
            return ProtocolParseOutcome.notHandled();
        }

        for (ProtocolParserPublishedDTO definition : candidates) {
            if (!matchesDefinition(definition, parseContext)) {
                continue;
            }
            try {
                ParseContext effectiveContext = enrichContext(parseContext, definition, productId, knownDeviceContext);
                ParseExecutionResult executionResult = execute(definition, effectiveContext);
                if (executionResult == null) {
                    continue;
                }
                if (executionResult.isDrop() || executionResult.isNeedMoreData()) {
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
                    return ProtocolParseOutcome.handled(List.of());
                }

                List<DeviceMessage> messages = normalizeMessages(
                        executionResult.getMessages(),
                        effectiveContext,
                        resolvedDeviceContext
                );
                return ProtocolParseOutcome.handled(messages);
            } catch (Exception ex) {
                log.warn("Custom parser execution failed: productId={}, definitionId={}, error={}",
                        productId, definition.getDefinitionId(), ex.getMessage());
                return ProtocolParseOutcome.handled(List.of());
            }
        }

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
                .payloadHex(toHex(actualPayload))
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
        log.debug("Unsupported parser mode for now: definitionId={}, parserMode={}",
                definition.getDefinitionId(), definition.getParserMode());
        return null;
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

    private boolean matchesDefinition(ProtocolParserPublishedDTO definition, ParseContext parseContext) {
        if (!equalsIgnoreCase(definition.getProtocol(), parseContext.getProtocol())) {
            return false;
        }
        if (!equalsIgnoreCase(definition.getTransport(), parseContext.getTransport())) {
            return false;
        }
        String direction = definition.getDirection() == null ? DEFAULT_DIRECTION : definition.getDirection();
        if (!DEFAULT_DIRECTION.equals(upper(direction))) {
            return false;
        }

        Map<String, Object> rule = readJsonMap(definition.getMatchRuleJson());
        if (rule.isEmpty()) {
            return true;
        }

        if (!matchStringRule(parseContext.getTopic(), rule.get("topicEquals"), rule.get("topicPrefix"), rule.get("topicContains"))) {
            return false;
        }
        if (!matchStringRule(parseContext.getRemoteAddress(), rule.get("remoteAddressEquals"),
                rule.get("remoteAddressPrefix"), rule.get("remoteAddressContains"))) {
            return false;
        }
        if (!matchStringRule(parseContext.getSessionId(), rule.get("sessionIdEquals"),
                rule.get("sessionIdPrefix"), rule.get("sessionIdContains"))) {
            return false;
        }
        return matchHeaders(parseContext.getHeaders(), rule.get("headerEquals"));
    }

    private boolean matchStringRule(String actual, Object equalsRule, Object prefixRule, Object containsRule) {
        if (equalsRule != null && !safeEquals(actual, asString(equalsRule))) {
            return false;
        }
        if (prefixRule != null) {
            String prefix = asString(prefixRule);
            if (actual == null || prefix == null || !actual.startsWith(prefix)) {
                return false;
            }
        }
        if (containsRule != null) {
            String contains = asString(containsRule);
            if (actual == null || contains == null || !actual.contains(contains)) {
                return false;
            }
        }
        return true;
    }

    private boolean matchHeaders(Map<String, String> headers, Object headerRule) {
        if (!(headerRule instanceof Map<?, ?> expectedHeaders)) {
            return true;
        }
        if (headers == null) {
            return false;
        }
        for (Map.Entry<?, ?> entry : expectedHeaders.entrySet()) {
            String key = entry.getKey() == null ? null : entry.getKey().toString();
            String expectedValue = entry.getValue() == null ? null : entry.getValue().toString();
            if (key == null || !safeEquals(headers.get(key), expectedValue)) {
                return false;
            }
        }
        return true;
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

    private static String toHex(byte[] payload) {
        StringBuilder builder = new StringBuilder(payload.length * 2);
        for (byte value : payload) {
            builder.append(String.format("%02X", value));
        }
        return builder.toString();
    }

    private String upper(String value) {
        return value == null ? null : value.trim().toUpperCase(Locale.ROOT);
    }

    private boolean equalsIgnoreCase(String left, String right) {
        return safeEquals(upper(left), upper(right));
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
