package com.songhg.firefly.iot.rule.dataforward.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.expression.MapAccessor;
import org.springframework.expression.Expression;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.SimpleEvaluationContext;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 数据流转模板渲染器：与规则引擎一致的 {@code ${expr}} + SpEL 求值口径，
 * 用于把目标配置中的占位符替换为设备消息字段。
 */
@Component
public class ForwardTemplateRenderer {

    private static final Pattern TEMPLATE_PATTERN = Pattern.compile("\\$\\{([^}]+)}");

    private final ObjectMapper objectMapper;
    private final ExpressionParser spelParser = new SpelExpressionParser();

    public ForwardTemplateRenderer(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String render(String template, Map<String, Object> variables) {
        if (!StringUtils.hasText(template)) {
            return template;
        }
        Matcher matcher = TEMPLATE_PATTERN.matcher(template);
        StringBuffer buffer = new StringBuffer();
        while (matcher.find()) {
            Object value = evaluate(matcher.group(1), variables);
            matcher.appendReplacement(buffer, Matcher.quoteReplacement(value == null ? "" : String.valueOf(value)));
        }
        matcher.appendTail(buffer);
        return buffer.toString();
    }

    public Object renderJsonValue(JsonNode node, Map<String, Object> variables) {
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
            return render(node.asText(), variables);
        }
        return objectMapper.convertValue(node, Object.class);
    }

    public String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value == null ? Collections.emptyMap() : value);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to serialize forward payload", ex);
        }
    }

    public String requiredText(JsonNode node, String field, Map<String, Object> variables) {
        String value = textOrNull(node, field, variables);
        if (!StringUtils.hasText(value)) {
            throw new IllegalStateException(field + " is required");
        }
        return value;
    }

    public String textOrDefault(JsonNode node, String field, String defaultValue, Map<String, Object> variables) {
        String value = textOrNull(node, field, variables);
        return value == null ? defaultValue : value;
    }

    public String textOrNull(JsonNode node, String field, Map<String, Object> variables) {
        if (node == null || node.get(field) == null || node.get(field).isNull()) {
            return null;
        }
        return render(node.get(field).asText(), variables);
    }

    /**
     * 求值一个 SpEL 表达式（用于过滤条件），返回其原始结果。
     */
    public Object evaluate(String expression, Map<String, Object> context) {
        Expression spelExpression = spelParser.parseExpression(normalizeExpression(expression));
        // 与规则引擎共用同一受限求值口径：只允许只读数据访问与属性绑定，禁止方法与构造器调用。
        SimpleEvaluationContext evaluationContext = SimpleEvaluationContext.forPropertyAccessors(new MapAccessor())
                .build();
        return spelExpression.getValue(evaluationContext, context);
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
}
