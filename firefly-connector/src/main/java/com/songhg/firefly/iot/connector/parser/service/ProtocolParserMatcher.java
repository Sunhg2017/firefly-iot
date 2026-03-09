package com.songhg.firefly.iot.connector.parser.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.connector.parser.model.DownlinkEncodeContext;
import com.songhg.firefly.iot.connector.parser.model.ParseContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class ProtocolParserMatcher {

    private static final String DEFAULT_DIRECTION = "UPLINK";

    private final ObjectMapper objectMapper;

    public boolean matches(ProtocolParserPublishedDTO definition, ParseContext parseContext) {
        return matches(definition, parseContext, DEFAULT_DIRECTION);
    }

    public boolean matches(ProtocolParserPublishedDTO definition, ParseContext parseContext, String direction) {
        if (!equalsIgnoreCase(definition.getProtocol(), parseContext.getProtocol())) {
            return false;
        }
        if (!equalsIgnoreCase(definition.getTransport(), parseContext.getTransport())) {
            return false;
        }
        if (!directionMatches(definition, direction)) {
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
        if (!matchStringRule(parseContext.getProductKey(), rule.get("productKeyEquals"), null, null)) {
            return false;
        }
        return matchHeaders(parseContext.getHeaders(), rule.get("headerEquals"));
    }

    public boolean matchesDownlink(ProtocolParserPublishedDTO definition, DownlinkEncodeContext context) {
        if (!equalsIgnoreCase(definition.getProtocol(), context.getProtocol())) {
            return false;
        }
        if (!equalsIgnoreCase(definition.getTransport(), context.getTransport())) {
            return false;
        }
        if (!directionMatches(definition, "DOWNLINK")) {
            return false;
        }

        Map<String, Object> rule = readJsonMap(definition.getMatchRuleJson());
        if (rule.isEmpty()) {
            return true;
        }
        if (!matchStringRule(context.getTopic(), rule.get("topicEquals"), rule.get("topicPrefix"), rule.get("topicContains"))) {
            return false;
        }
        if (!matchStringRule(context.getDeviceName(), rule.get("deviceNameEquals"), null, null)) {
            return false;
        }
        if (!matchStringRule(context.getProductKey(), rule.get("productKeyEquals"), null, null)) {
            return false;
        }
        if (!matchStringRule(context.getMessageType(), rule.get("messageTypeEquals"), null, null)) {
            return false;
        }
        return matchHeaders(context.getHeaders(), rule.get("headerEquals"));
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

    private Map<String, Object> readJsonMap(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception ex) {
            log.warn("Parse match rule failed: {}", ex.getMessage());
            return new LinkedHashMap<>();
        }
    }

    private boolean directionMatches(ProtocolParserPublishedDTO definition, String expectedDirection) {
        String definitionDirection = definition.getDirection() == null ? DEFAULT_DIRECTION : definition.getDirection();
        return safeEquals(upper(expectedDirection), upper(definitionDirection));
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
}
