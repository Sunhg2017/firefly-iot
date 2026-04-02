package com.songhg.firefly.iot.rule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.client.DeviceClient;
import com.songhg.firefly.iot.api.client.NotificationClient;
import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.api.dto.NotificationRequestDTO;
import com.songhg.firefly.iot.common.enums.RuleActionType;
import com.songhg.firefly.iot.common.enums.RuleEngineStatus;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.rule.entity.RuleAction;
import com.songhg.firefly.iot.rule.entity.RuleEngine;
import com.songhg.firefly.iot.rule.mapper.RuleActionMapper;
import com.songhg.firefly.iot.rule.mapper.RuleEngineMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.expression.MapAccessor;
import org.springframework.expression.Expression;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class RuleRuntimeService {

    private static final Pattern RULE_SQL_PATTERN = Pattern.compile(
            "(?is)^select\\s+(.+?)\\s+from\\s+(?:'([^']+)'|\"([^\"]+)\"|([^\\s]+))(?:\\s+where\\s+(.+))?$"
    );
    private static final Pattern SELECT_ALIAS_PATTERN = Pattern.compile("(?is)^(.*?)(?:\\s+as\\s+([a-zA-Z_][a-zA-Z0-9_]*))?$");
    private static final Pattern TEMPLATE_PATTERN = Pattern.compile("\\$\\{([^}]+)}");
    private static final Pattern SIMPLE_IDENTIFIER_PATTERN = Pattern.compile("[a-zA-Z_][a-zA-Z0-9_]*$");

    private final RuleEngineMapper ruleEngineMapper;
    private final RuleActionMapper ruleActionMapper;
    private final NotificationClient notificationClient;
    private final DeviceClient deviceClient;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    @Qualifier("ruleRuntimeHttpClient")
    private final HttpClient httpClient;

    private final ExpressionParser spelParser = new SpelExpressionParser();

    public void process(DeviceMessage message) {
        if (message == null || message.getTenantId() == null) {
            log.debug("Skip rule runtime because message or tenantId is missing");
            return;
        }

        List<RuleDefinition> rules = loadEnabledRules(message.getTenantId());
        if (rules.isEmpty()) {
            return;
        }

        AtomicReference<DeviceBasicVO> deviceBasicRef = new AtomicReference<>();
        for (RuleDefinition definition : rules) {
            try {
                executeRule(definition, message, deviceBasicRef);
            } catch (Exception ex) {
                log.error("Rule runtime failed unexpectedly: ruleId={}, messageId={}", definition.rule().getId(), message.getMessageId(), ex);
            }
        }
    }

    private List<RuleDefinition> loadEnabledRules(Long tenantId) {
        List<RuleEngine> rules = ruleEngineMapper.selectList(new LambdaQueryWrapper<RuleEngine>()
                .eq(RuleEngine::getTenantId, tenantId)
                .eq(RuleEngine::getStatus, RuleEngineStatus.ENABLED)
                .orderByAsc(RuleEngine::getId));
        if (rules.isEmpty()) {
            return List.of();
        }

        Map<Long, List<RuleAction>> actionMap = ruleActionMapper.selectList(new LambdaQueryWrapper<RuleAction>()
                        .in(RuleAction::getRuleId, rules.stream().map(RuleEngine::getId).toList())
                        .eq(RuleAction::getEnabled, true)
                        .orderByAsc(RuleAction::getRuleId)
                        .orderByAsc(RuleAction::getSortOrder)
                        .orderByAsc(RuleAction::getId))
                .stream()
                .collect(Collectors.groupingBy(RuleAction::getRuleId, LinkedHashMap::new, Collectors.toList()));

        return rules.stream()
                .map(rule -> new RuleDefinition(rule, actionMap.getOrDefault(rule.getId(), List.of())))
                .toList();
    }

    private void executeRule(RuleDefinition definition, DeviceMessage message, AtomicReference<DeviceBasicVO> deviceBasicRef) {
        RuleEngine rule = definition.rule();
        ParsedRule parsedRule = parseRuleSql(rule.getSqlExpr());
        if (!matchesSource(parsedRule.sourcePattern(), message)) {
            return;
        }
        if (rule.getProjectId() != null && !matchesProject(rule.getProjectId(), message, deviceBasicRef)) {
            return;
        }

        Map<String, Object> context = buildContext(message, deviceBasicRef.get());
        if (!matchesWhere(parsedRule.whereClause(), context)) {
            return;
        }

        Map<String, Object> actionVariables = buildActionVariables(parsedRule, context);
        LocalDateTime triggeredAt = LocalDateTime.now();
        try {
            for (RuleAction action : definition.actions()) {
                executeAction(rule, action, message, actionVariables);
            }
            ruleEngineMapper.recordExecutionSuccess(rule.getId(), triggeredAt);
            log.debug("Rule triggered successfully: ruleId={}, messageId={}", rule.getId(), message.getMessageId());
        } catch (Exception ex) {
            ruleEngineMapper.recordExecutionFailure(rule.getId(), triggeredAt);
            log.error("Rule action execution failed: ruleId={}, messageId={}", rule.getId(), message.getMessageId(), ex);
        }
    }

    private boolean matchesProject(Long projectId, DeviceMessage message, AtomicReference<DeviceBasicVO> deviceBasicRef) {
        DeviceBasicVO deviceBasic = deviceBasicRef.updateAndGet(existing -> existing != null ? existing : loadDeviceBasic(message.getDeviceId()));
        return deviceBasic != null && Objects.equals(projectId, deviceBasic.getProjectId());
    }

    private DeviceBasicVO loadDeviceBasic(Long deviceId) {
        if (deviceId == null) {
            return null;
        }
        R<DeviceBasicVO> response = deviceClient.getDeviceBasic(deviceId);
        if (response == null || response.getCode() != 0) {
            throw new IllegalStateException("Failed to query device basic info for runtime rule");
        }
        return response.getData();
    }

    private Map<String, Object> buildContext(DeviceMessage message, DeviceBasicVO deviceBasic) {
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("message", message);
        context.put("messageId", message.getMessageId());
        context.put("tenantId", message.getTenantId());
        context.put("productId", message.getProductId());
        context.put("deviceId", message.getDeviceId());
        context.put("deviceName", message.getDeviceName());
        context.put("type", message.getType() == null ? null : message.getType().name());
        context.put("topic", message.getTopic());
        context.put("payload", message.getPayload() == null ? Collections.emptyMap() : message.getPayload());
        context.put("payloadJson", writeJson(message.getPayload()));
        context.put("timestamp", message.getTimestamp());
        if (deviceBasic != null) {
            context.put("projectId", deviceBasic.getProjectId());
            context.put("productName", deviceBasic.getProductName());
            context.put("nickname", deviceBasic.getNickname());
        }
        if (message.getPayload() != null) {
            message.getPayload().forEach(context::putIfAbsent);
        }
        return context;
    }

    private Map<String, Object> buildActionVariables(ParsedRule parsedRule, Map<String, Object> context) {
        Map<String, Object> variables = new LinkedHashMap<>(context);
        if (parsedRule.selectAll()) {
            return variables;
        }
        for (SelectExpression selectExpression : parsedRule.selectExpressions()) {
            variables.put(selectExpression.alias(), evaluateValue(selectExpression.expression(), context));
        }
        return variables;
    }

    private void executeAction(RuleEngine rule, RuleAction action, DeviceMessage message, Map<String, Object> variables) {
        JsonNode config = parseActionConfig(action.getActionConfig());
        switch (action.getActionType()) {
            case KAFKA_FORWARD -> executeKafkaForward(config, message, variables);
            case WEBHOOK -> executeWebhook(config, variables);
            case EMAIL, SMS -> executeNotification(rule, action.getActionType(), config, variables);
            case DEVICE_COMMAND -> executeDeviceCommand(config, message, variables);
            case DB_WRITE -> throw new IllegalStateException("DB_WRITE action is not supported by runtime yet");
            default -> throw new IllegalStateException("Unsupported rule action type: " + action.getActionType());
        }
    }

    private void executeKafkaForward(JsonNode config, DeviceMessage message, Map<String, Object> variables) {
        String topic = renderString(requiredText(config, "topic"), variables);
        String key = renderString(textOrNull(config, "key"), variables);
        Object payload = config.has("payload") ? renderJsonValue(config.get("payload"), variables) : variables;
        String serialized = payload instanceof String ? (String) payload : writeJson(payload);
        kafkaTemplate.send(topic, StringUtils.hasText(key) ? key : String.valueOf(message.getDeviceId()), serialized);
    }

    private void executeWebhook(JsonNode config, Map<String, Object> variables) {
        String url = renderString(requiredText(config, "url"), variables);
        String method = renderString(textOrDefault(config, "method", "POST"), variables).toUpperCase(Locale.ROOT);

        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(config.path("timeoutSeconds").asInt(10)));

        Map<String, String> headers = renderStringMap(config.get("headers"), variables);
        headers.forEach(builder::header);

        JsonNode bodyNode = config.get("body");
        if (bodyNode == null || bodyNode.isNull()) {
            builder.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            Object body = renderJsonValue(bodyNode, variables);
            String content = body instanceof String ? (String) body : writeJson(body);
            if (!headers.containsKey("Content-Type")) {
                builder.header("Content-Type", "application/json; charset=UTF-8");
            }
            builder.method(method, HttpRequest.BodyPublishers.ofString(content, StandardCharsets.UTF_8));
        }

        try {
            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() >= 400) {
                throw new IllegalStateException("Webhook returned HTTP " + response.statusCode());
            }
        } catch (Exception ex) {
            throw new IllegalStateException("Webhook invocation failed", ex);
        }
    }

    private void executeNotification(RuleEngine rule, RuleActionType actionType, JsonNode config, Map<String, Object> variables) {
        Long channelId = requiredLong(config, "channelId");
        String templateCode = renderString(requiredText(config, "templateCode"), variables);
        String recipient = renderString(textOrNull(config, "recipient"), variables);

        Map<String, String> variableMap = renderStringMap(config.get("variables"), variables);
        if (!variableMap.containsKey("actionType")) {
            variableMap.put("actionType", actionType.getValue());
        }
        if (!variableMap.containsKey("ruleName")) {
            variableMap.put("ruleName", rule.getName());
        }

        NotificationRequestDTO request = NotificationRequestDTO.builder()
                .tenantId(rule.getTenantId())
                .channelId(channelId)
                .templateCode(templateCode)
                .recipient(recipient)
                .variables(variableMap)
                .build();
        R<Void> response = notificationClient.send(request);
        if (response == null || response.getCode() != 0) {
            throw new IllegalStateException("Notification dispatch failed");
        }
    }

    private void executeDeviceCommand(JsonNode config, DeviceMessage sourceMessage, Map<String, Object> variables) {
        String commandType = renderString(requiredText(config, "commandType"), variables);
        DeviceMessage.MessageType messageType = DeviceMessage.MessageType.valueOf(commandType.trim().toUpperCase(Locale.ROOT));

        Map<String, Object> payload = new LinkedHashMap<>();
        if (config.has("payload")) {
            Object rendered = renderJsonValue(config.get("payload"), variables);
            payload = convertToMap(rendered);
        }
        if (config.has("serviceName")) {
            payload.put("serviceName", renderString(config.get("serviceName").asText(), variables));
        }
        if (config.has("params")) {
            payload.put("params", convertToMap(renderJsonValue(config.get("params"), variables)));
        }

        DeviceMessage command = DeviceMessage.builder()
                .tenantId(sourceMessage.getTenantId())
                .productId(sourceMessage.getProductId())
                .deviceId(sourceMessage.getDeviceId())
                .deviceName(sourceMessage.getDeviceName())
                .type(messageType)
                .payload(payload)
                .timestamp(System.currentTimeMillis())
                .build();
        kafkaTemplate.send(KafkaTopics.DEVICE_MESSAGE_DOWN, String.valueOf(sourceMessage.getDeviceId()), writeJson(command));
    }

    private ParsedRule parseRuleSql(String sqlExpr) {
        Matcher matcher = RULE_SQL_PATTERN.matcher(sqlExpr == null ? "" : sqlExpr.trim());
        if (!matcher.matches()) {
            throw new IllegalStateException("Unsupported rule SQL expression: " + sqlExpr);
        }

        String selectClause = matcher.group(1).trim();
        String sourcePattern = firstNonBlank(matcher.group(2), matcher.group(3), matcher.group(4));
        String whereClause = trimToNull(matcher.group(5));
        if ("*".equals(selectClause)) {
            return new ParsedRule(true, List.of(), sourcePattern, whereClause);
        }

        List<SelectExpression> expressions = new ArrayList<>();
        int index = 1;
        for (String part : splitTopLevel(selectClause)) {
            Matcher selectMatcher = SELECT_ALIAS_PATTERN.matcher(part.trim());
            if (!selectMatcher.matches()) {
                throw new IllegalStateException("Invalid select expression: " + part);
            }
            String expression = selectMatcher.group(1).trim();
            String alias = trimToNull(selectMatcher.group(2));
            if (alias == null) {
                alias = deriveAlias(expression, index++);
            }
            expressions.add(new SelectExpression(expression, alias));
        }
        return new ParsedRule(false, expressions, sourcePattern, whereClause);
    }

    private boolean matchesSource(String sourcePattern, DeviceMessage message) {
        if (!StringUtils.hasText(sourcePattern)) {
            return true;
        }
        Set<String> candidates = new LinkedHashSet<>();
        if (StringUtils.hasText(message.getTopic())) {
            candidates.add(message.getTopic());
        }
        if (message.getType() != null) {
            candidates.add(message.getType().name());
        }
        if (candidates.isEmpty()) {
            return false;
        }
        String regex = wildcardToRegex(sourcePattern);
        return candidates.stream().filter(StringUtils::hasText).anyMatch(candidate -> candidate.matches(regex));
    }

    private boolean matchesWhere(String whereClause, Map<String, Object> context) {
        if (!StringUtils.hasText(whereClause)) {
            return true;
        }
        Object value = evaluateValue(whereClause, context);
        if (value instanceof Boolean bool) {
            return bool;
        }
        return Boolean.parseBoolean(String.valueOf(value));
    }

    private Object evaluateValue(String expression, Map<String, Object> context) {
        Expression spelExpression = spelParser.parseExpression(normalizeExpression(expression));
        StandardEvaluationContext evaluationContext = new StandardEvaluationContext(context);
        evaluationContext.addPropertyAccessor(new MapAccessor());
        return spelExpression.getValue(evaluationContext);
    }

    private String normalizeExpression(String expression) {
        String normalized = expression.trim();
        normalized = normalized.replaceAll("(?i)\\bAND\\b", "&&");
        normalized = normalized.replaceAll("(?i)\\bOR\\b", "||");
        normalized = normalized.replaceAll("(?i)\\bNOT\\b", "!");
        normalized = normalized.replace("<>", "!=");
        normalized = normalized.replaceAll("(?<![!<>=])=(?!=)", "==");
        return normalized;
    }

    private Object renderJsonValue(JsonNode node, Map<String, Object> variables) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isObject()) {
            Map<String, Object> result = new LinkedHashMap<>();
            node.fields().forEachRemaining(entry -> result.put(entry.getKey(), renderJsonValue(entry.getValue(), variables)));
            return result;
        }
        if (node.isArray()) {
            List<Object> result = new ArrayList<>();
            node.forEach(item -> result.add(renderJsonValue(item, variables)));
            return result;
        }
        if (node.isTextual()) {
            return renderString(node.asText(), variables);
        }
        return objectMapper.convertValue(node, Object.class);
    }

    private String renderString(String template, Map<String, Object> variables) {
        if (!StringUtils.hasText(template)) {
            return template;
        }
        Matcher matcher = TEMPLATE_PATTERN.matcher(template);
        StringBuffer buffer = new StringBuffer();
        while (matcher.find()) {
            Object value = evaluateValue(matcher.group(1), variables);
            matcher.appendReplacement(buffer, Matcher.quoteReplacement(value == null ? "" : String.valueOf(value)));
        }
        matcher.appendTail(buffer);
        return buffer.toString();
    }

    private JsonNode parseActionConfig(String actionConfig) {
        try {
            return objectMapper.readTree(actionConfig == null ? "{}" : actionConfig);
        } catch (Exception ex) {
            throw new IllegalStateException("Invalid action config JSON", ex);
        }
    }

    private Map<String, String> renderStringMap(JsonNode node, Map<String, Object> variables) {
        if (node == null || node.isNull()) {
            return new LinkedHashMap<>();
        }
        Map<String, String> result = new LinkedHashMap<>();
        node.fields().forEachRemaining(entry -> result.put(entry.getKey(), renderString(String.valueOf(renderJsonValue(entry.getValue(), variables)), variables)));
        return result;
    }

    private Map<String, Object> convertToMap(Object value) {
        if (value == null) {
            return new LinkedHashMap<>();
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> result = new LinkedHashMap<>();
            map.forEach((key, item) -> result.put(String.valueOf(key), item));
            return result;
        }
        return objectMapper.convertValue(value, LinkedHashMap.class);
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value == null ? Collections.emptyMap() : value);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to serialize runtime payload", ex);
        }
    }

    private String requiredText(JsonNode node, String fieldName) {
        String value = textOrNull(node, fieldName);
        if (!StringUtils.hasText(value)) {
            throw new IllegalStateException(fieldName + " is required");
        }
        return value;
    }

    private Long requiredLong(JsonNode node, String fieldName) {
        if (!node.hasNonNull(fieldName)) {
            throw new IllegalStateException(fieldName + " is required");
        }
        return node.get(fieldName).asLong();
    }

    private String textOrDefault(JsonNode node, String fieldName, String defaultValue) {
        String value = textOrNull(node, fieldName);
        return value == null ? defaultValue : value;
    }

    private String textOrNull(JsonNode node, String fieldName) {
        if (node == null || node.get(fieldName) == null || node.get(fieldName).isNull()) {
            return null;
        }
        return trimToNull(node.get(fieldName).asText());
    }

    private List<String> splitTopLevel(String text) {
        List<String> parts = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int roundDepth = 0;
        int squareDepth = 0;
        int curlyDepth = 0;
        boolean inSingleQuote = false;
        boolean inDoubleQuote = false;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == '\'' && !inDoubleQuote) {
                inSingleQuote = !inSingleQuote;
            } else if (ch == '"' && !inSingleQuote) {
                inDoubleQuote = !inDoubleQuote;
            } else if (!inSingleQuote && !inDoubleQuote) {
                if (ch == '(') {
                    roundDepth++;
                } else if (ch == ')') {
                    roundDepth--;
                } else if (ch == '[') {
                    squareDepth++;
                } else if (ch == ']') {
                    squareDepth--;
                } else if (ch == '{') {
                    curlyDepth++;
                } else if (ch == '}') {
                    curlyDepth--;
                } else if (ch == ',' && roundDepth == 0 && squareDepth == 0 && curlyDepth == 0) {
                    parts.add(current.toString().trim());
                    current.setLength(0);
                    continue;
                }
            }
            current.append(ch);
        }
        if (!current.isEmpty()) {
            parts.add(current.toString().trim());
        }
        return parts.stream().filter(StringUtils::hasText).toList();
    }

    private String deriveAlias(String expression, int index) {
        Matcher matcher = SIMPLE_IDENTIFIER_PATTERN.matcher(expression);
        if (matcher.find()) {
            return matcher.group();
        }
        return "expr" + index;
    }

    private String wildcardToRegex(String sourcePattern) {
        StringBuilder regex = new StringBuilder("(?i)^");
        for (char ch : sourcePattern.toCharArray()) {
            if (ch == '*') {
                regex.append(".*");
            } else if (ch == '?') {
                regex.append('.');
            } else if ("\\.[]{}()+-^$|".indexOf(ch) >= 0) {
                regex.append('\\').append(ch);
            } else {
                regex.append(ch);
            }
        }
        regex.append('$');
        return regex.toString();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }

    private record RuleDefinition(RuleEngine rule, List<RuleAction> actions) {
    }

    private record ParsedRule(boolean selectAll, List<SelectExpression> selectExpressions, String sourcePattern,
                              String whereClause) {
    }

    private record SelectExpression(String expression, String alias) {
    }
}
