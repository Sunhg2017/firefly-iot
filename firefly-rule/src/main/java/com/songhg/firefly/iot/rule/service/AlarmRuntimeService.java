package com.songhg.firefly.iot.rule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.client.DeviceClient;
import com.songhg.firefly.iot.api.client.NotificationClient;
import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.api.dto.NotificationRequestDTO;
import com.songhg.firefly.iot.common.enums.AlarmLevel;
import com.songhg.firefly.iot.common.enums.AlarmStatus;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.rule.dto.alarmruntime.AlarmChannelOption;
import com.songhg.firefly.iot.rule.dto.alarmruntime.AlarmMetricAggregate;
import com.songhg.firefly.iot.rule.dto.alarmruntime.AlarmMetricValuePoint;
import com.songhg.firefly.iot.rule.dto.alarmruntime.AlarmRecipientUser;
import com.songhg.firefly.iot.rule.entity.AlarmRecord;
import com.songhg.firefly.iot.rule.entity.AlarmRule;
import com.songhg.firefly.iot.rule.mapper.AlarmRecordMapper;
import com.songhg.firefly.iot.rule.mapper.AlarmRuleMapper;
import com.songhg.firefly.iot.rule.mapper.AlarmRuntimeMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.expression.MapAccessor;
import org.springframework.expression.Expression;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlarmRuntimeService {

    private static final String STRUCTURED_MODE = "STRUCTURED";
    private static final DateTimeFormatter ALARM_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final List<AlarmLevel> LEVEL_PRIORITY = List.of(
            AlarmLevel.CRITICAL,
            AlarmLevel.WARNING,
            AlarmLevel.INFO
    );
    private static final Set<AlarmStatus> OPEN_STATUSES = EnumSet.of(
            AlarmStatus.TRIGGERED,
            AlarmStatus.CONFIRMED,
            AlarmStatus.PROCESSED
    );
    private static final Map<String, String> TEMPLATE_CODE_BY_CHANNEL = Map.of(
            "EMAIL", "ALARM_EMAIL",
            "SMS", "ALARM_SMS",
            "PHONE", "ALARM_PHONE",
            "WECHAT", "ALARM_WECHAT",
            "DINGTALK", "ALARM_DINGTALK",
            "WEBHOOK", "ALARM_WEBHOOK",
            "IN_APP", "ALARM_IN_APP"
    );
    private static final Set<String> CHANNELS_REQUIRING_TARGET_USERS = Set.of("EMAIL", "SMS", "PHONE", "IN_APP");
    private static final String PLATFORM_NAME = "Firefly IoT";

    private final AlarmRuleMapper alarmRuleMapper;
    private final AlarmRecordMapper alarmRecordMapper;
    private final AlarmRuntimeMapper alarmRuntimeMapper;
    private final DeviceClient deviceClient;
    private final NotificationClient notificationClient;
    private final ObjectMapper objectMapper;

    private final ExpressionParser spelParser = new SpelExpressionParser();

    public void process(DeviceMessage rawMessage) {
        DeviceMessage message = normalizeMessage(rawMessage);
        if (message == null
                || message.getTenantId() == null
                || message.getDeviceId() == null
                || message.getType() != DeviceMessage.MessageType.PROPERTY_REPORT) {
            return;
        }

        List<AlarmRule> rules = loadEnabledRules(message);
        if (rules.isEmpty()) {
            return;
        }

        AtomicReference<DeviceBasicVO> deviceBasicRef = new AtomicReference<>();
        for (AlarmRule rule : rules) {
            try {
                processRule(rule, message, deviceBasicRef);
            } catch (Exception ex) {
                log.error("Alarm runtime failed unexpectedly: ruleId={}, messageId={}",
                        rule.getId(), message.getMessageId(), ex);
            }
        }
    }

    private DeviceMessage normalizeMessage(DeviceMessage message) {
        if (message == null || message.getType() != DeviceMessage.MessageType.PROPERTY_REPORT) {
            return message;
        }
        Map<String, Object> payload = message.getPayload();
        if (payload == null || payload.isEmpty()) {
            return message;
        }
        Object params = payload.get("params");
        if (params instanceof Map<?, ?> paramsMap) {
            return copyWithPayload(message, toStringKeyMap(paramsMap));
        }
        Object properties = payload.get("properties");
        if (properties instanceof Map<?, ?> propertiesMap) {
            return copyWithPayload(message, toStringKeyMap(propertiesMap));
        }
        return message;
    }

    private DeviceMessage copyWithPayload(DeviceMessage message, Map<String, Object> payload) {
        if (payload == null || payload == message.getPayload()) {
            return message;
        }
        return DeviceMessage.builder()
                .messageId(message.getMessageId())
                .tenantId(message.getTenantId())
                .productId(message.getProductId())
                .deviceId(message.getDeviceId())
                .deviceName(message.getDeviceName())
                .type(message.getType())
                .topic(message.getTopic())
                .payload(payload)
                .timestamp(message.getTimestamp())
                .build();
    }

    private Map<String, Object> toStringKeyMap(Map<?, ?> source) {
        Map<String, Object> normalized = new LinkedHashMap<>();
        source.forEach((key, value) -> {
            if (key != null) {
                normalized.put(key.toString(), value);
            }
        });
        return normalized;
    }

    private List<AlarmRule> loadEnabledRules(DeviceMessage message) {
        LambdaQueryWrapper<AlarmRule> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AlarmRule::getTenantId, message.getTenantId())
                .eq(AlarmRule::getEnabled, true)
                .orderByAsc(AlarmRule::getId);
        if (message.getProductId() != null) {
            wrapper.and(item -> item.isNull(AlarmRule::getProductId)
                    .or()
                    .eq(AlarmRule::getProductId, message.getProductId()));
        } else {
            wrapper.isNull(AlarmRule::getProductId);
        }
        wrapper.and(item -> item.isNull(AlarmRule::getDeviceId)
                .or()
                .eq(AlarmRule::getDeviceId, message.getDeviceId()));
        return alarmRuleMapper.selectList(wrapper);
    }

    private void processRule(AlarmRule rule, DeviceMessage message, AtomicReference<DeviceBasicVO> deviceBasicRef) {
        if (rule.getProjectId() != null && !matchesProject(rule.getProjectId(), message, deviceBasicRef)) {
            return;
        }

        DeviceBasicVO deviceBasic = deviceBasicRef.get();
        AlarmMatch match = evaluateRule(rule, message, deviceBasic);
        AlarmRecord activeRecord = findOpenRecord(rule.getTenantId(), rule.getId(), message.getDeviceId());
        if (!match.matched()) {
            if (activeRecord != null) {
                closeRecord(activeRecord, "系统检测到告警条件已恢复，自动关闭当前告警。");
            }
            return;
        }

        if (activeRecord == null) {
            AlarmRecord record = createRecord(rule, message, deviceBasic, match);
            dispatchNotifications(rule, message, deviceBasic, record);
            return;
        }

        if (isHigherLevel(match.level(), activeRecord.getLevel())) {
            closeRecord(activeRecord,
                    "系统检测到更高级别告警，自动关闭当前记录并升级为 " + match.level().getDescription() + "。");
            AlarmRecord record = createRecord(rule, message, deviceBasic, match);
            dispatchNotifications(rule, message, deviceBasic, record);
        }
    }

    private boolean matchesProject(Long projectId, DeviceMessage message, AtomicReference<DeviceBasicVO> deviceBasicRef) {
        DeviceBasicVO deviceBasic = deviceBasicRef.updateAndGet(existing ->
                existing != null ? existing : loadDeviceBasic(message.getDeviceId()));
        return deviceBasic != null && Objects.equals(projectId, deviceBasic.getProjectId());
    }

    private DeviceBasicVO loadDeviceBasic(Long deviceId) {
        if (deviceId == null) {
            return null;
        }
        R<DeviceBasicVO> response = deviceClient.getDeviceBasic(deviceId);
        if (response == null || response.getCode() != 0) {
            throw new IllegalStateException("Failed to query device basic info for alarm runtime");
        }
        return response.getData();
    }

    private AlarmMatch evaluateRule(AlarmRule rule, DeviceMessage message, DeviceBasicVO deviceBasic) {
        ParsedAlarmRule parsedRule = parseConditionExpr(rule.getConditionExpr());
        LocalDateTime occurredAt = resolveOccurredAt(message.getTimestamp());
        Map<String, Object> context = buildContext(message, deviceBasic);

        GroupMatch bestMatch = null;
        for (ParsedAlarmGroup group : parsedRule.groups()) {
            GroupMatch groupMatch = evaluateGroup(group, message, context, occurredAt);
            if (!groupMatch.matched()) {
                continue;
            }
            if (bestMatch == null || isHigherLevel(groupMatch.level(), bestMatch.level())) {
                bestMatch = groupMatch;
            }
        }

        if (bestMatch == null) {
            return AlarmMatch.notMatched();
        }

        String triggerValue = bestMatch.conditions().stream()
                .filter(ConditionEvaluation::matched)
                .map(ConditionEvaluation::summary)
                .collect(Collectors.joining(" | "));
        String content = buildAlarmContent(rule, message, deviceBasic, bestMatch.level(), occurredAt, triggerValue);
        return new AlarmMatch(true, bestMatch.level(), content, trimToNull(triggerValue));
    }

    private GroupMatch evaluateGroup(ParsedAlarmGroup group,
                                     DeviceMessage message,
                                     Map<String, Object> context,
                                     LocalDateTime occurredAt) {
        List<ConditionEvaluation> evaluations = new ArrayList<>();
        int matchedCount = 0;
        for (ParsedAlarmCondition condition : group.conditions()) {
            ConditionEvaluation evaluation = evaluateCondition(condition, message, context, occurredAt);
            evaluations.add(evaluation);
            if (evaluation.matched()) {
                matchedCount++;
            }
        }

        boolean matched = switch (group.triggerMode()) {
            case "ANY" -> matchedCount > 0;
            case "AT_LEAST" -> matchedCount >= group.matchCount();
            default -> matchedCount == evaluations.size();
        };
        return new GroupMatch(matched, group.level(), evaluations);
    }

    private ConditionEvaluation evaluateCondition(ParsedAlarmCondition condition,
                                                  DeviceMessage message,
                                                  Map<String, Object> context,
                                                  LocalDateTime occurredAt) {
        return switch (condition.type()) {
            case "THRESHOLD" -> evaluateThresholdCondition(condition, message);
            case "CONTINUOUS" -> evaluateContinuousCondition(condition, message);
            case "ACCUMULATE" -> evaluateAccumulateCondition(condition, message, occurredAt);
            case "COMPARE" -> evaluateCompareCondition(condition, message, occurredAt);
            case "CUSTOM" -> evaluateCustomCondition(condition, context);
            default -> new ConditionEvaluation(false, "不支持的条件类型: " + condition.type());
        };
    }

    private ConditionEvaluation evaluateThresholdCondition(ParsedAlarmCondition condition, DeviceMessage message) {
        Double currentValue = resolveCurrentNumericMetricValue(condition.metricKey(), message);
        if (currentValue == null) {
            return new ConditionEvaluation(false, condition.metricKey() + " 当前值不可用");
        }
        boolean matched = compareNumeric(currentValue, condition.operator(), condition.threshold());
        String summary = "最新值 " + condition.metricKey() + "=" + formatNumber(currentValue) + " "
                + operatorLabel(condition.operator()) + " " + formatNumber(condition.threshold());
        return new ConditionEvaluation(matched, summary);
    }

    private ConditionEvaluation evaluateContinuousCondition(ParsedAlarmCondition condition, DeviceMessage message) {
        List<AlarmMetricValuePoint> recentValues = alarmRuntimeMapper.selectRecentNumericValues(
                message.getTenantId(),
                message.getDeviceId(),
                condition.metricKey(),
                condition.consecutiveCount()
        );
        if (recentValues.size() < condition.consecutiveCount()) {
            return new ConditionEvaluation(false,
                    condition.metricKey() + " 连续样本不足 " + condition.consecutiveCount() + " 次");
        }
        boolean matched = recentValues.stream().allMatch(item ->
                item.getValueNumber() != null && compareNumeric(item.getValueNumber(), condition.operator(), condition.threshold()));
        String valuesText = recentValues.stream()
                .map(AlarmMetricValuePoint::getValueNumber)
                .filter(Objects::nonNull)
                .map(this::formatNumber)
                .collect(Collectors.joining(", "));
        String summary = condition.metricKey() + " 连续 " + condition.consecutiveCount() + " 次样本 ["
                + valuesText + "] " + operatorLabel(condition.operator()) + " " + formatNumber(condition.threshold());
        return new ConditionEvaluation(matched, summary);
    }

    private ConditionEvaluation evaluateAccumulateCondition(ParsedAlarmCondition condition,
                                                            DeviceMessage message,
                                                            LocalDateTime occurredAt) {
        TimeWindow currentWindow = buildCurrentWindow(condition.windowSize(), condition.windowUnit(), occurredAt);
        AlarmMetricAggregate aggregate = alarmRuntimeMapper.selectMetricAggregate(
                message.getTenantId(),
                message.getDeviceId(),
                condition.metricKey(),
                currentWindow.startTime(),
                currentWindow.endTime()
        );
        Double aggregateValue = resolveAggregateValue(aggregate, condition.aggregateType());
        if (aggregateValue == null) {
            return new ConditionEvaluation(false, currentWindow.label() + " 内没有可用样本");
        }
        boolean matched = compareNumeric(aggregateValue, condition.operator(), condition.threshold());
        String summary = currentWindow.label() + " "
                + aggregateLabel(condition.aggregateType()) + " " + condition.metricKey() + "="
                + formatNumber(aggregateValue) + " "
                + operatorLabel(condition.operator()) + " " + formatNumber(condition.threshold());
        return new ConditionEvaluation(matched, summary);
    }

    private ConditionEvaluation evaluateCompareCondition(ParsedAlarmCondition condition,
                                                         DeviceMessage message,
                                                         LocalDateTime occurredAt) {
        TimeWindow currentWindow = buildCurrentWindow(condition.windowSize(), condition.windowUnit(), occurredAt);
        TimeWindow compareWindow = buildCompareWindow(condition.windowSize(), condition.windowUnit(),
                condition.compareTarget(), currentWindow);

        AlarmMetricAggregate currentAggregate = alarmRuntimeMapper.selectMetricAggregate(
                message.getTenantId(),
                message.getDeviceId(),
                condition.metricKey(),
                currentWindow.startTime(),
                currentWindow.endTime()
        );
        AlarmMetricAggregate compareAggregate = alarmRuntimeMapper.selectMetricAggregate(
                message.getTenantId(),
                message.getDeviceId(),
                condition.metricKey(),
                compareWindow.startTime(),
                compareWindow.endTime()
        );
        Double currentValue = resolveAggregateValue(currentAggregate, condition.aggregateType());
        Double compareValue = resolveAggregateValue(compareAggregate, condition.aggregateType());
        if (currentValue == null || compareValue == null) {
            return new ConditionEvaluation(false, "同环比窗口样本不足");
        }

        Double deltaValue = resolveCompareDelta(currentValue, compareValue, condition.changeMode());
        if (deltaValue == null) {
            return new ConditionEvaluation(false, "对比窗口基线为 0，无法计算变化比例");
        }
        boolean matched = compareDelta(deltaValue, condition.changeDirection(), condition.threshold());
        String summary = currentWindow.label() + " " + aggregateLabel(condition.aggregateType()) + " "
                + condition.metricKey() + "=" + formatNumber(currentValue)
                + "，基线窗口=" + formatNumber(compareValue)
                + "，变化" + changeModeSuffix(condition.changeMode()) + "=" + formatNumber(deltaValue)
                + "，方向=" + changeDirectionLabel(condition.changeDirection())
                + "，阈值=" + formatNumber(condition.threshold());
        return new ConditionEvaluation(matched, summary);
    }

    private ConditionEvaluation evaluateCustomCondition(ParsedAlarmCondition condition, Map<String, Object> context) {
        Object result = evaluateExpression(condition.customExpr(), context);
        boolean matched = result instanceof Boolean bool
                ? bool
                : Boolean.parseBoolean(String.valueOf(result));
        String summary = "自定义表达式 `" + condition.customExpr() + "` = " + matched;
        return new ConditionEvaluation(matched, summary);
    }

    private Map<String, Object> buildContext(DeviceMessage message, DeviceBasicVO deviceBasic) {
        Map<String, Object> payload = message.getPayload() == null ? Map.of() : message.getPayload();
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("message", message);
        context.put("messageId", message.getMessageId());
        context.put("tenantId", message.getTenantId());
        context.put("productId", message.getProductId());
        context.put("deviceId", message.getDeviceId());
        context.put("deviceName", message.getDeviceName());
        context.put("topic", message.getTopic());
        context.put("payload", payload);
        context.put("timestamp", message.getTimestamp());
        if (deviceBasic != null) {
            context.put("projectId", deviceBasic.getProjectId());
            context.put("productName", deviceBasic.getProductName());
            context.put("nickname", deviceBasic.getNickname());
        }
        payload.forEach(context::putIfAbsent);
        return context;
    }

    private Object evaluateExpression(String expression, Map<String, Object> context) {
        Expression spelExpression = spelParser.parseExpression(normalizeExpression(expression));
        StandardEvaluationContext evaluationContext = new StandardEvaluationContext(context);
        evaluationContext.addPropertyAccessor(new MapAccessor());
        return spelExpression.getValue(evaluationContext);
    }

    private String normalizeExpression(String expression) {
        String normalized = expression == null ? "" : expression.trim();
        normalized = normalized.replaceAll("(?i)\\bAND\\b", "&&");
        normalized = normalized.replaceAll("(?i)\\bOR\\b", "||");
        normalized = normalized.replaceAll("(?i)\\bNOT\\b", "!");
        normalized = normalized.replace("<>", "!=");
        normalized = normalized.replaceAll("(?<![!<>=])=(?!=)", "==");
        return normalized;
    }

    private AlarmRecord findOpenRecord(Long tenantId, Long ruleId, Long deviceId) {
        return alarmRecordMapper.selectOne(new LambdaQueryWrapper<AlarmRecord>()
                .eq(AlarmRecord::getTenantId, tenantId)
                .eq(AlarmRecord::getAlarmRuleId, ruleId)
                .eq(AlarmRecord::getDeviceId, deviceId)
                .in(AlarmRecord::getStatus, OPEN_STATUSES)
                .orderByDesc(AlarmRecord::getCreatedAt)
                .last("LIMIT 1"));
    }

    private AlarmRecord createRecord(AlarmRule rule,
                                     DeviceMessage message,
                                     DeviceBasicVO deviceBasic,
                                     AlarmMatch match) {
        LocalDateTime now = resolveOccurredAt(message.getTimestamp());
        AlarmRecord record = new AlarmRecord();
        record.setTenantId(rule.getTenantId());
        record.setAlarmRuleId(rule.getId());
        record.setProjectId(deviceBasic != null ? deviceBasic.getProjectId() : rule.getProjectId());
        record.setProductId(message.getProductId() != null ? message.getProductId() : rule.getProductId());
        record.setDeviceId(message.getDeviceId());
        record.setLevel(match.level());
        record.setStatus(AlarmStatus.TRIGGERED);
        record.setTitle(rule.getName());
        record.setContent(match.content());
        record.setTriggerValue(match.triggerValue());
        record.setCreatedAt(now);
        record.setUpdatedAt(now);
        alarmRecordMapper.insert(record);
        log.info("Alarm triggered: ruleId={}, recordId={}, deviceId={}, level={}",
                rule.getId(), record.getId(), message.getDeviceId(), match.level());
        return record;
    }

    private void closeRecord(AlarmRecord record, String remark) {
        record.setStatus(AlarmStatus.CLOSED);
        record.setProcessRemark(mergeRemark(record.getProcessRemark(), remark));
        record.setUpdatedAt(LocalDateTime.now());
        alarmRecordMapper.updateById(record);
        log.info("Alarm closed automatically: recordId={}, ruleId={}", record.getId(), record.getAlarmRuleId());
    }

    private String mergeRemark(String currentRemark, String appendRemark) {
        String current = trimToNull(currentRemark);
        String append = trimToNull(appendRemark);
        if (current == null) {
            return append;
        }
        if (append == null || current.contains(append)) {
            return current;
        }
        return current + "\n" + append;
    }

    private void dispatchNotifications(AlarmRule rule,
                                       DeviceMessage message,
                                       DeviceBasicVO deviceBasic,
                                       AlarmRecord record) {
        NotifyPlan notifyPlan = parseNotifyPlan(rule.getNotifyConfig());
        if (notifyPlan.channelTypes().isEmpty()) {
            return;
        }

        List<AlarmRecipientUser> targetUsers = resolveTargetUsers(rule.getTenantId(),
                notifyPlan.recipientGroupCodes(), notifyPlan.recipientUsernames());
        Map<String, AlarmChannelOption> channelByType = resolveChannelByType(rule.getTenantId(), notifyPlan.channelTypes());
        Map<String, String> variables = buildNotificationVariables(rule, message, deviceBasic, record);

        for (String channelType : notifyPlan.channelTypes()) {
            AlarmChannelOption channel = channelByType.get(channelType);
            if (channel == null) {
                log.warn("Skip alarm notification because no enabled channel exists: tenantId={}, ruleId={}, type={}",
                        rule.getTenantId(), rule.getId(), channelType);
                continue;
            }
            String templateCode = TEMPLATE_CODE_BY_CHANNEL.get(channelType);
            if (templateCode == null) {
                log.warn("Skip alarm notification because template mapping is missing: type={}", channelType);
                continue;
            }
            String recipient = buildRecipient(channelType, targetUsers);
            try {
                sendNotification(rule.getTenantId(), channel.getId(), templateCode, recipient, variables);
            } catch (Exception ex) {
                log.error("Alarm notification dispatch failed: tenantId={}, ruleId={}, type={}",
                        rule.getTenantId(), rule.getId(), channelType, ex);
            }
        }
    }

    private NotifyPlan parseNotifyPlan(String rawNotifyConfig) {
        String source = trimToNull(rawNotifyConfig);
        if (source == null) {
            return NotifyPlan.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(source);
            if (!root.isObject()) {
                return NotifyPlan.empty();
            }
            return new NotifyPlan(
                    normalizeStringSet(root.get("channels")),
                    normalizeStringSet(root.get("recipientGroupCodes")),
                    normalizeStringSet(root.get("recipientUsernames"))
            );
        } catch (Exception ex) {
            log.warn("Skip malformed alarm notify config, reason={}", ex.getMessage());
            return NotifyPlan.empty();
        }
    }

    private List<AlarmRecipientUser> resolveTargetUsers(Long tenantId,
                                                        Set<String> recipientGroupCodes,
                                                        Set<String> recipientUsernames) {
        LinkedHashMap<Long, AlarmRecipientUser> users = new LinkedHashMap<>();
        if (!recipientGroupCodes.isEmpty()) {
            alarmRuntimeMapper.selectActiveGroupUsers(tenantId, new ArrayList<>(recipientGroupCodes))
                    .forEach(user -> {
                        if (user != null && user.getUserId() != null) {
                            users.put(user.getUserId(), user);
                        }
                    });
        }
        if (!recipientUsernames.isEmpty()) {
            alarmRuntimeMapper.selectActiveUsersByUsernames(tenantId, new ArrayList<>(recipientUsernames))
                    .forEach(user -> {
                        if (user != null && user.getUserId() != null) {
                            users.put(user.getUserId(), user);
                        }
                    });
        }
        return new ArrayList<>(users.values());
    }

    private Map<String, AlarmChannelOption> resolveChannelByType(Long tenantId, Set<String> channelTypes) {
        if (channelTypes.isEmpty()) {
            return Map.of();
        }
        Map<String, AlarmChannelOption> channelByType = new LinkedHashMap<>();
        for (AlarmChannelOption channel : alarmRuntimeMapper.selectAvailableChannelsByTypes(
                tenantId, new ArrayList<>(channelTypes))) {
            channelByType.putIfAbsent(channel.getType(), channel);
        }
        return channelByType;
    }

    private String buildRecipient(String channelType, Collection<AlarmRecipientUser> targetUsers) {
        return switch (channelType) {
            case "EMAIL" -> joinDistinct(targetUsers.stream().map(AlarmRecipientUser::getEmail).toList());
            case "SMS", "PHONE" -> joinDistinct(targetUsers.stream().map(AlarmRecipientUser::getPhone).toList());
            case "IN_APP" -> joinDistinct(targetUsers.stream()
                    .map(AlarmRecipientUser::getUserId)
                    .filter(Objects::nonNull)
                    .map(String::valueOf)
                    .toList());
            case "WECHAT", "DINGTALK", "WEBHOOK" -> null;
            default -> null;
        };
    }

    private void sendNotification(Long tenantId,
                                  Long channelId,
                                  String templateCode,
                                  String recipient,
                                  Map<String, String> variables) {
        NotificationRequestDTO request = NotificationRequestDTO.builder()
                .tenantId(tenantId)
                .channelId(channelId)
                .templateCode(templateCode)
                .recipient(recipient)
                .variables(variables)
                .build();
        R<Void> response = notificationClient.send(request);
        if (response == null || response.getCode() != 0) {
            throw new IllegalStateException("Notification dispatch failed");
        }
    }

    private Map<String, String> buildNotificationVariables(AlarmRule rule,
                                                           DeviceMessage message,
                                                           DeviceBasicVO deviceBasic,
                                                           AlarmRecord record) {
        String deviceCode = firstNonBlank(
                deviceBasic == null ? null : deviceBasic.getDeviceName(),
                message.getDeviceName(),
                String.valueOf(message.getDeviceId())
        );
        String deviceDisplayName = firstNonBlank(
                deviceBasic == null ? null : deviceBasic.getNickname(),
                deviceCode
        );
        Map<String, String> variables = new LinkedHashMap<>();
        variables.put("platform_name", PLATFORM_NAME);
        variables.put("device_name", deviceDisplayName);
        variables.put("device_id", deviceCode);
        variables.put("alarm_level", record.getLevel().getDescription());
        variables.put("alarm_level_code", record.getLevel().getValue());
        variables.put("rule_name", rule.getName());
        variables.put("alarm_content", firstNonBlank(record.getContent(), ""));
        variables.put("alarm_time", ALARM_TIME_FORMATTER.format(record.getCreatedAt()));
        variables.put("alarm_status", record.getStatus().getValue());
        variables.put("alarm_trigger_value", firstNonBlank(record.getTriggerValue(), ""));
        variables.put("product_name", deviceBasic == null ? "" : firstNonBlank(deviceBasic.getProductName(), ""));
        return variables;
    }

    private ParsedAlarmRule parseConditionExpr(String rawConditionExpr) {
        try {
            JsonNode root = objectMapper.readTree(rawConditionExpr);
            if (!root.isObject() || !STRUCTURED_MODE.equals(root.path("mode").asText())) {
                throw new IllegalStateException("alarm rule must use structured mode");
            }
            JsonNode groupsNode = root.path("groups");
            if (!groupsNode.isArray() || groupsNode.isEmpty()) {
                throw new IllegalStateException("alarm rule groups are required");
            }

            List<ParsedAlarmGroup> groups = new ArrayList<>();
            for (JsonNode groupNode : groupsNode) {
                AlarmLevel level = AlarmLevel.valueOf(groupNode.path("level").asText());
                String triggerMode = groupNode.path("triggerMode").asText("ALL");
                Integer matchCount = groupNode.hasNonNull("matchCount") ? groupNode.path("matchCount").asInt(1) : 1;
                List<ParsedAlarmCondition> conditions = new ArrayList<>();
                for (JsonNode conditionNode : groupNode.path("conditions")) {
                    conditions.add(new ParsedAlarmCondition(
                            conditionNode.path("type").asText(),
                            trimToNull(conditionNode.path("metricKey").asText(null)),
                            trimToNull(conditionNode.path("aggregateType").asText(null)),
                            trimToNull(conditionNode.path("operator").asText(null)),
                            conditionNode.hasNonNull("threshold") ? conditionNode.path("threshold").asDouble() : null,
                            conditionNode.hasNonNull("windowSize") ? conditionNode.path("windowSize").asInt() : null,
                            trimToNull(conditionNode.path("windowUnit").asText(null)),
                            trimToNull(conditionNode.path("compareTarget").asText(null)),
                            trimToNull(conditionNode.path("changeMode").asText(null)),
                            trimToNull(conditionNode.path("changeDirection").asText(null)),
                            conditionNode.hasNonNull("consecutiveCount") ? conditionNode.path("consecutiveCount").asInt() : null,
                            trimToNull(conditionNode.path("customExpr").asText(null))
                    ));
                }
                groups.add(new ParsedAlarmGroup(level, triggerMode, matchCount, conditions));
            }
            return new ParsedAlarmRule(groupsBySeverity(groups));
        } catch (Exception ex) {
            throw new IllegalStateException("failed to parse alarm rule condition", ex);
        }
    }

    private <T extends HasLevel> List<T> groupsBySeverity(List<T> source) {
        return source.stream()
                .sorted((left, right) -> Integer.compare(levelIndex(left.level()), levelIndex(right.level())))
                .toList();
    }

    private Double resolveCurrentNumericMetricValue(String metricKey, DeviceMessage message) {
        if (metricKey == null) {
            return null;
        }
        Object payloadValue = message.getPayload() == null ? null : message.getPayload().get(metricKey);
        Double currentValue = toDouble(payloadValue);
        if (currentValue != null) {
            return currentValue;
        }
        List<AlarmMetricValuePoint> recentValues = alarmRuntimeMapper.selectRecentNumericValues(
                message.getTenantId(), message.getDeviceId(), metricKey, 1);
        if (recentValues.isEmpty()) {
            return null;
        }
        return recentValues.getFirst().getValueNumber();
    }

    private TimeWindow buildCurrentWindow(Integer windowSize, String windowUnit, LocalDateTime occurredAt) {
        Duration duration = toDuration(windowSize, windowUnit);
        return new TimeWindow(occurredAt.minus(duration), occurredAt,
                windowSize + windowUnitLabel(windowUnit));
    }

    private TimeWindow buildCompareWindow(Integer windowSize,
                                          String windowUnit,
                                          String compareTarget,
                                          TimeWindow currentWindow) {
        Duration currentDuration = Duration.between(currentWindow.startTime(), currentWindow.endTime());
        Duration shift = "SAME_PERIOD".equals(compareTarget)
                ? samePeriodShift(windowUnit)
                : currentDuration;
        LocalDateTime endTime = currentWindow.endTime().minus(shift);
        LocalDateTime startTime = endTime.minus(currentDuration);
        String label = "SAME_PERIOD".equals(compareTarget)
                ? "同周期对比窗口"
                : "上一统计窗口";
        return new TimeWindow(startTime, endTime, label);
    }

    private Duration samePeriodShift(String windowUnit) {
        return switch (windowUnit) {
            case "DAYS" -> Duration.ofDays(7);
            case "HOURS", "MINUTES" -> Duration.ofDays(1);
            default -> Duration.ofDays(1);
        };
    }

    private Duration toDuration(Integer windowSize, String windowUnit) {
        int size = windowSize == null || windowSize <= 0 ? 1 : windowSize;
        return switch (windowUnit) {
            case "DAYS" -> Duration.ofDays(size);
            case "HOURS" -> Duration.ofHours(size);
            default -> Duration.ofMinutes(size);
        };
    }

    private Double resolveAggregateValue(AlarmMetricAggregate aggregate, String aggregateType) {
        if (aggregate == null || aggregate.getSampleCount() == null || aggregate.getSampleCount() == 0) {
            return null;
        }
        return switch (aggregateType) {
            case "AVG" -> aggregate.getAvgValue();
            case "MAX" -> aggregate.getMaxValue();
            case "MIN" -> aggregate.getMinValue();
            case "SUM" -> aggregate.getSumValue();
            case "COUNT" -> aggregate.getSampleCount().doubleValue();
            case "LATEST" -> aggregate.getLatestValue();
            default -> aggregate.getAvgValue();
        };
    }

    private Double resolveCompareDelta(Double currentValue, Double compareValue, String changeMode) {
        if ("PERCENT".equals(changeMode)) {
            if (compareValue == null || compareValue == 0D) {
                return null;
            }
            return ((currentValue - compareValue) / Math.abs(compareValue)) * 100D;
        }
        return currentValue - compareValue;
    }

    private boolean compareDelta(Double deltaValue, String direction, Double threshold) {
        if (deltaValue == null || threshold == null) {
            return false;
        }
        return switch (direction) {
            case "DOWN" -> deltaValue <= -threshold;
            case "EITHER" -> Math.abs(deltaValue) >= threshold;
            default -> deltaValue >= threshold;
        };
    }

    private boolean compareNumeric(Double actualValue, String operator, Double threshold) {
        if (actualValue == null || threshold == null) {
            return false;
        }
        return switch (operator) {
            case "GTE" -> actualValue >= threshold;
            case "LT" -> actualValue < threshold;
            case "LTE" -> actualValue <= threshold;
            case "EQ" -> Double.compare(actualValue, threshold) == 0;
            case "NEQ" -> Double.compare(actualValue, threshold) != 0;
            default -> actualValue > threshold;
        };
    }

    private boolean isHigherLevel(AlarmLevel candidate, AlarmLevel current) {
        return levelIndex(candidate) < levelIndex(current);
    }

    private int levelIndex(AlarmLevel level) {
        int index = LEVEL_PRIORITY.indexOf(level);
        return index >= 0 ? index : Integer.MAX_VALUE;
    }

    private LocalDateTime resolveOccurredAt(long timestamp) {
        if (timestamp <= 0) {
            return LocalDateTime.now();
        }
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(timestamp), ZoneId.systemDefault());
    }

    private String buildAlarmContent(AlarmRule rule,
                                     DeviceMessage message,
                                     DeviceBasicVO deviceBasic,
                                     AlarmLevel level,
                                     LocalDateTime occurredAt,
                                     String triggerValue) {
        String deviceCode = firstNonBlank(
                deviceBasic == null ? null : deviceBasic.getDeviceName(),
                message.getDeviceName(),
                String.valueOf(message.getDeviceId())
        );
        String deviceDisplayName = firstNonBlank(
                deviceBasic == null ? null : deviceBasic.getNickname(),
                deviceCode
        );
        String summary = firstNonBlank(triggerValue, "告警条件命中");
        return "设备 " + deviceDisplayName + " (" + deviceCode + ") 于 "
                + ALARM_TIME_FORMATTER.format(occurredAt) + " 触发 "
                + level.getDescription() + " 告警，规则：" + rule.getName()
                + "，命中条件：" + summary;
    }

    private Set<String> normalizeStringSet(JsonNode node) {
        if (node == null || !node.isArray()) {
            return Set.of();
        }
        Set<String> values = new LinkedHashSet<>();
        node.forEach(item -> {
            String value = trimToNull(item.asText(null));
            if (value != null) {
                values.add(value);
            }
        });
        return values;
    }

    private String joinDistinct(List<String> values) {
        return trimToNull(values.stream()
                .map(this::trimToNull)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.joining(",")));
    }

    private Double toDouble(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            try {
                return Double.parseDouble(text.trim());
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
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

    private String operatorLabel(String operator) {
        return switch (operator) {
            case "GTE" -> ">=";
            case "LT" -> "<";
            case "LTE" -> "<=";
            case "EQ" -> "=";
            case "NEQ" -> "!=";
            default -> ">";
        };
    }

    private String aggregateLabel(String aggregateType) {
        return switch (aggregateType) {
            case "MAX" -> "最大值";
            case "MIN" -> "最小值";
            case "SUM" -> "累计值";
            case "COUNT" -> "计数";
            case "LATEST" -> "最新值";
            default -> "平均值";
        };
    }

    private String windowUnitLabel(String windowUnit) {
        return switch (windowUnit) {
            case "DAYS" -> "天";
            case "HOURS" -> "小时";
            default -> "分钟";
        };
    }

    private String changeModeSuffix(String changeMode) {
        return "PERCENT".equals(changeMode) ? "%" : "";
    }

    private String changeDirectionLabel(String changeDirection) {
        return switch (changeDirection) {
            case "DOWN" -> "下降";
            case "EITHER" -> "双向";
            default -> "上升";
        };
    }

    private String formatNumber(Double value) {
        if (value == null) {
            return "-";
        }
        if (value == Math.rint(value)) {
            return String.valueOf(value.longValue());
        }
        return String.format(Locale.ROOT, "%.2f", value);
    }

    private record ParsedAlarmRule(List<ParsedAlarmGroup> groups) {
    }

    private interface HasLevel {
        AlarmLevel level();
    }

    private record ParsedAlarmGroup(AlarmLevel level,
                                    String triggerMode,
                                    Integer matchCount,
                                    List<ParsedAlarmCondition> conditions) implements HasLevel {
    }

    private record ParsedAlarmCondition(String type,
                                        String metricKey,
                                        String aggregateType,
                                        String operator,
                                        Double threshold,
                                        Integer windowSize,
                                        String windowUnit,
                                        String compareTarget,
                                        String changeMode,
                                        String changeDirection,
                                        Integer consecutiveCount,
                                        String customExpr) {
    }

    private record ConditionEvaluation(boolean matched, String summary) {
    }

    private record GroupMatch(boolean matched,
                              AlarmLevel level,
                              List<ConditionEvaluation> conditions) {
    }

    private record AlarmMatch(boolean matched, AlarmLevel level, String content, String triggerValue) {

        private static AlarmMatch notMatched() {
            return new AlarmMatch(false, null, null, null);
        }
    }

    private record NotifyPlan(Set<String> channelTypes,
                              Set<String> recipientGroupCodes,
                              Set<String> recipientUsernames) {

        private static NotifyPlan empty() {
            return new NotifyPlan(Set.of(), Set.of(), Set.of());
        }
    }

    private record TimeWindow(LocalDateTime startTime, LocalDateTime endTime, String label) {
    }
}
