package com.songhg.firefly.iot.rule.dataforward.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.enums.DataForwardTargetType;
import com.songhg.firefly.iot.common.enums.ForwardStatus;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.metrics.Metrics;
import com.songhg.firefly.iot.rule.dataforward.entity.DataForwardRule;
import com.songhg.firefly.iot.rule.dataforward.mapper.DataForwardRuleMapper;
import com.songhg.firefly.iot.rule.dataforward.support.ForwardTemplateRenderer;
import com.songhg.firefly.iot.rule.dataforward.executor.DataForwardTargetExecutor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 数据流转运行时：消费归一化设备消息，命中启用规则后调用目标执行器转发。
 * 与规则引擎共享 {@code rule.engine.input} 数据源，但使用独立消费组，互不影响。
 */
@Slf4j
@Service
public class DataForwardRuntimeService {

    private final DataForwardRuleMapper ruleMapper;
    private final ObjectMapper objectMapper;
    private final ForwardTemplateRenderer renderer;
    private final Map<DataForwardTargetType, DataForwardTargetExecutor> executors = new EnumMap<>(DataForwardTargetType.class);

    public DataForwardRuntimeService(DataForwardRuleMapper ruleMapper,
                                     ObjectMapper objectMapper,
                                     ForwardTemplateRenderer renderer,
                                     List<DataForwardTargetExecutor> executorList) {
        this.ruleMapper = ruleMapper;
        this.objectMapper = objectMapper;
        this.renderer = renderer;
        for (DataForwardTargetExecutor executor : executorList) {
            executors.put(executor.type(), executor);
        }
    }

    public void process(DeviceMessage message) {
        if (message == null || message.getTenantId() == null) {
            return;
        }
        List<DataForwardRule> rules = loadEnabledRules(message.getTenantId());
        if (rules.isEmpty()) {
            return;
        }

        Map<String, Object> variables = buildVariables(message);
        for (DataForwardRule rule : rules) {
            LocalDateTime triggeredAt = LocalDateTime.now();
            try {
                if (!matchesSource(rule.getSourcePattern(), message)) {
                    continue;
                }
                if (StringUtils.hasText(rule.getMatchCondition())
                        && !matchesCondition(rule.getMatchCondition(), variables)) {
                    continue;
                }
                DataForwardTargetExecutor executor = executors.get(rule.getTargetType());
                if (executor == null) {
                    throw new IllegalStateException("Unsupported target type: " + rule.getTargetType());
                }
                executor.execute(rule, message, variables);
                ruleMapper.recordExecutionSuccess(rule.getId(), triggeredAt);
                Metrics.increment("firefly.dataforward.execution.success", "target", String.valueOf(rule.getTargetType()));
            } catch (Exception ex) {
                ruleMapper.recordExecutionFailure(rule.getId(), triggeredAt);
                Metrics.increment("firefly.dataforward.execution.failed", "target", String.valueOf(rule.getTargetType()));
                log.error("Data forward rule execution failed: ruleId={}, messageId={}", rule.getId(), message.getMessageId(), ex);
            }
        }
    }

    private List<DataForwardRule> loadEnabledRules(Long tenantId) {
        return ruleMapper.selectList(new LambdaQueryWrapper<DataForwardRule>()
                .eq(DataForwardRule::getTenantId, tenantId)
                .eq(DataForwardRule::getStatus, ForwardStatus.ENABLED)
                .orderByAsc(DataForwardRule::getId));
    }

    private Map<String, Object> buildVariables(DeviceMessage message) {
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("message", messageFields(message));
        context.put("messageId", message.getMessageId());
        context.put("tenantId", message.getTenantId());
        context.put("productId", message.getProductId());
        context.put("deviceId", message.getDeviceId());
        context.put("deviceName", message.getDeviceName());
        context.put("type", message.getType() == null ? null : message.getType().name());
        context.put("topic", message.getTopic());
        context.put("payload", message.getPayload() == null ? Collections.emptyMap() : message.getPayload());
        context.put("payloadJson", renderer.writeJson(message.getPayload()));
        context.put("timestamp", message.getTimestamp());
        if (message.getPayload() != null) {
            message.getPayload().forEach(context::putIfAbsent);
        }
        return context;
    }

    private Map<String, Object> messageFields(DeviceMessage message) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("messageId", message.getMessageId());
        fields.put("tenantId", message.getTenantId());
        fields.put("productId", message.getProductId());
        fields.put("deviceId", message.getDeviceId());
        fields.put("deviceName", message.getDeviceName());
        fields.put("type", message.getType() == null ? null : message.getType().name());
        fields.put("topic", message.getTopic());
        fields.put("payload", message.getPayload() == null ? Collections.emptyMap() : message.getPayload());
        fields.put("timestamp", message.getTimestamp());
        return fields;
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

    private boolean matchesCondition(String condition, Map<String, Object> context) {
        try {
            Object value = renderer.evaluate(condition, context);
            if (value instanceof Boolean bool) {
                return bool;
            }
            return Boolean.parseBoolean(String.valueOf(value));
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to evaluate match condition", ex);
        }
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
}
