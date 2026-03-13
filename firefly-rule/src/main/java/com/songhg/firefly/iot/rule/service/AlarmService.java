package com.songhg.firefly.iot.rule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.AlarmLevel;
import com.songhg.firefly.iot.common.enums.AlarmStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.mybatis.DataScope;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.rule.convert.AlarmConvert;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmProcessDTO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRecordQueryDTO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRecordVO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRuleCreateDTO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRuleQueryDTO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRuleUpdateDTO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRuleVO;
import com.songhg.firefly.iot.rule.entity.AlarmRecord;
import com.songhg.firefly.iot.rule.entity.AlarmRule;
import com.songhg.firefly.iot.rule.mapper.AlarmRecordMapper;
import com.songhg.firefly.iot.rule.mapper.AlarmRuleMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlarmService {

    private static final String STRUCTURED_MODE = "STRUCTURED";
    private static final Set<String> SUPPORTED_CONDITION_TYPES = Set.of(
            "THRESHOLD",
            "COMPARE",
            "CONTINUOUS",
            "ACCUMULATE",
            "CUSTOM"
    );
    private static final Set<String> SUPPORTED_TRIGGER_MODES = Set.of("ALL", "ANY", "AT_LEAST");
    private static final Set<String> SUPPORTED_NOTIFY_CHANNEL_TYPES = Set.of(
            "EMAIL",
            "SMS",
            "PHONE",
            "WECHAT",
            "DINGTALK",
            "WEBHOOK",
            "IN_APP"
    );
    private static final List<AlarmLevel> LEVEL_PRIORITY = List.of(
            AlarmLevel.CRITICAL,
            AlarmLevel.WARNING,
            AlarmLevel.INFO
    );

    private final AlarmRuleMapper alarmRuleMapper;
    private final AlarmRecordMapper alarmRecordMapper;
    private final ObjectMapper objectMapper;

    @Transactional
    public AlarmRuleVO createAlarmRule(AlarmRuleCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();

        NormalizedCondition normalizedCondition = normalizeConditionExpr(dto.getConditionExpr());
        NormalizedNotifyConfig normalizedNotifyConfig = normalizeNotifyConfig(dto.getNotifyConfig());
        dto.setConditionExpr(normalizedCondition.conditionExpr());
        dto.setNotifyConfig(normalizedNotifyConfig.notifyConfig());
        dto.setLevel(normalizedCondition.level());

        AlarmRule rule = AlarmConvert.INSTANCE.toRuleEntity(dto);
        rule.setTenantId(tenantId);
        rule.setEnabled(true);
        rule.setCreatedBy(userId);
        alarmRuleMapper.insert(rule);

        log.info("Alarm rule created: id={}, name={}, tenantId={}", rule.getId(), rule.getName(), tenantId);
        return AlarmConvert.INSTANCE.toRuleVO(rule);
    }

    public AlarmRuleVO getAlarmRuleById(Long id) {
        AlarmRule rule = alarmRuleMapper.selectById(id);
        if (rule == null) {
            throw new BizException(ResultCode.ALARM_RULE_NOT_FOUND);
        }
        return AlarmConvert.INSTANCE.toRuleVO(rule);
    }

    @DataScope
    public IPage<AlarmRuleVO> listAlarmRules(AlarmRuleQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<AlarmRule> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<AlarmRule> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AlarmRule::getTenantId, tenantId);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.like(AlarmRule::getName, query.getKeyword());
        }
        if (query.getLevel() != null) {
            wrapper.eq(AlarmRule::getLevel, query.getLevel());
        }
        if (query.getEnabled() != null) {
            wrapper.eq(AlarmRule::getEnabled, query.getEnabled());
        }
        if (query.getProductId() != null) {
            wrapper.eq(AlarmRule::getProductId, query.getProductId());
        }
        if (query.getProjectId() != null) {
            wrapper.eq(AlarmRule::getProjectId, query.getProjectId());
        }
        wrapper.orderByDesc(AlarmRule::getCreatedAt);

        IPage<AlarmRule> result = alarmRuleMapper.selectPage(page, wrapper);
        return result.convert(AlarmConvert.INSTANCE::toRuleVO);
    }

    @Transactional
    public AlarmRuleVO updateAlarmRule(Long id, AlarmRuleUpdateDTO dto) {
        AlarmRule rule = alarmRuleMapper.selectById(id);
        if (rule == null) {
            throw new BizException(ResultCode.ALARM_RULE_NOT_FOUND);
        }

        if (dto.getConditionExpr() != null) {
            NormalizedCondition normalizedCondition = normalizeConditionExpr(dto.getConditionExpr());
            dto.setConditionExpr(normalizedCondition.conditionExpr());
            dto.setLevel(normalizedCondition.level());
        }
        boolean shouldUpdateNotifyConfig = dto.getNotifyConfig() != null;
        if (shouldUpdateNotifyConfig) {
            NormalizedNotifyConfig normalizedNotifyConfig = normalizeNotifyConfig(dto.getNotifyConfig());
            dto.setNotifyConfig(normalizedNotifyConfig.notifyConfig());
        }

        AlarmConvert.INSTANCE.updateRuleEntity(dto, rule);
        if (shouldUpdateNotifyConfig) {
            rule.setNotifyConfig(dto.getNotifyConfig());
        }
        alarmRuleMapper.updateById(rule);
        return AlarmConvert.INSTANCE.toRuleVO(rule);
    }

    @Transactional
    public void deleteAlarmRule(Long id) {
        AlarmRule rule = alarmRuleMapper.selectById(id);
        if (rule == null) {
            throw new BizException(ResultCode.ALARM_RULE_NOT_FOUND);
        }
        alarmRuleMapper.deleteById(id);
        log.info("Alarm rule deleted: id={}, name={}", id, rule.getName());
    }

    @DataScope
    public IPage<AlarmRecordVO> listAlarmRecords(AlarmRecordQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<AlarmRecord> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<AlarmRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AlarmRecord::getTenantId, tenantId);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.like(AlarmRecord::getTitle, query.getKeyword());
        }
        if (query.getLevel() != null) {
            wrapper.eq(AlarmRecord::getLevel, query.getLevel());
        }
        if (query.getStatus() != null) {
            wrapper.eq(AlarmRecord::getStatus, query.getStatus());
        }
        if (query.getProductId() != null) {
            wrapper.eq(AlarmRecord::getProductId, query.getProductId());
        }
        if (query.getDeviceId() != null) {
            wrapper.eq(AlarmRecord::getDeviceId, query.getDeviceId());
        }
        if (query.getProjectId() != null) {
            wrapper.eq(AlarmRecord::getProjectId, query.getProjectId());
        }
        wrapper.orderByDesc(AlarmRecord::getCreatedAt);

        IPage<AlarmRecord> result = alarmRecordMapper.selectPage(page, wrapper);
        return result.convert(AlarmConvert.INSTANCE::toRecordVO);
    }

    public AlarmRecordVO getAlarmRecordById(Long id) {
        AlarmRecord record = alarmRecordMapper.selectById(id);
        if (record == null) {
            throw new BizException(ResultCode.ALARM_RECORD_NOT_FOUND);
        }
        return AlarmConvert.INSTANCE.toRecordVO(record);
    }

    @Transactional
    public void confirmAlarmRecord(Long id) {
        AlarmRecord record = alarmRecordMapper.selectById(id);
        if (record == null) {
            throw new BizException(ResultCode.ALARM_RECORD_NOT_FOUND);
        }
        if (record.getStatus() != AlarmStatus.TRIGGERED) {
            throw new BizException(ResultCode.ALARM_STATUS_ERROR);
        }
        record.setStatus(AlarmStatus.CONFIRMED);
        record.setConfirmedBy(AppContextHolder.getUserId());
        record.setConfirmedAt(LocalDateTime.now());
        alarmRecordMapper.updateById(record);
        log.info("Alarm record confirmed: id={}", id);
    }

    @Transactional
    public void processAlarmRecord(Long id, AlarmProcessDTO dto) {
        AlarmRecord record = alarmRecordMapper.selectById(id);
        if (record == null) {
            throw new BizException(ResultCode.ALARM_RECORD_NOT_FOUND);
        }
        if (record.getStatus() != AlarmStatus.TRIGGERED && record.getStatus() != AlarmStatus.CONFIRMED) {
            throw new BizException(ResultCode.ALARM_STATUS_ERROR);
        }
        record.setStatus(AlarmStatus.PROCESSED);
        record.setProcessedBy(AppContextHolder.getUserId());
        record.setProcessedAt(LocalDateTime.now());
        if (dto != null && dto.getProcessRemark() != null) {
            record.setProcessRemark(dto.getProcessRemark());
        }
        alarmRecordMapper.updateById(record);
        log.info("Alarm record processed: id={}", id);
    }

    @Transactional
    public void closeAlarmRecord(Long id) {
        AlarmRecord record = alarmRecordMapper.selectById(id);
        if (record == null) {
            throw new BizException(ResultCode.ALARM_RECORD_NOT_FOUND);
        }
        record.setStatus(AlarmStatus.CLOSED);
        alarmRecordMapper.updateById(record);
        log.info("Alarm record closed: id={}", id);
    }

    private NormalizedCondition normalizeConditionExpr(String rawConditionExpr) {
        if (rawConditionExpr == null || rawConditionExpr.isBlank()) {
            throw new BizException(ResultCode.PARAM_ERROR, "告警触发条件不能为空");
        }

        try {
            JsonNode root = objectMapper.readTree(rawConditionExpr.trim());
            if (!root.isObject() || !STRUCTURED_MODE.equals(root.path("mode").asText())) {
                throw new BizException(ResultCode.PARAM_ERROR, "告警规则必须使用结构化条件");
            }

            JsonNode groups = root.get("groups");
            if (groups == null || !groups.isArray() || groups.size() == 0) {
                throw new BizException(ResultCode.PARAM_ERROR, "告警规则至少需要维护一个级别块");
            }

            // The persisted rule level is always derived from the highest-severity group for filtering and statistics.
            AlarmLevel primaryLevel = null;
            for (int groupIndex = 0; groupIndex < groups.size(); groupIndex++) {
                JsonNode group = groups.get(groupIndex);
                if (group == null || !group.isObject()) {
                    throw new BizException(ResultCode.PARAM_ERROR, buildGroupMessage(groupIndex, "级别块格式不正确"));
                }

                AlarmLevel groupLevel = parseLevel(requireText(group, "level", buildGroupMessage(groupIndex, "缺少告警级别")));
                primaryLevel = primaryLevel == null ? groupLevel : pickHigherLevel(primaryLevel, groupLevel);

                String triggerMode = requireText(group, "triggerMode", buildGroupMessage(groupIndex, "缺少触发语义"));
                if (!SUPPORTED_TRIGGER_MODES.contains(triggerMode)) {
                    throw new BizException(ResultCode.PARAM_ERROR, buildGroupMessage(groupIndex, "不支持的触发语义: " + triggerMode));
                }

                JsonNode conditions = group.get("conditions");
                if (conditions == null || !conditions.isArray() || conditions.size() == 0) {
                    throw new BizException(ResultCode.PARAM_ERROR, buildGroupMessage(groupIndex, "至少需要一条触发条件"));
                }

                if ("AT_LEAST".equals(triggerMode)) {
                    int matchCount = requirePositiveInteger(group, "matchCount", buildGroupMessage(groupIndex, "缺少满足条数"));
                    if (matchCount > conditions.size()) {
                        throw new BizException(ResultCode.PARAM_ERROR, buildGroupMessage(groupIndex, "满足条数不能大于条件总数"));
                    }
                }

                for (int conditionIndex = 0; conditionIndex < conditions.size(); conditionIndex++) {
                    JsonNode condition = conditions.get(conditionIndex);
                    validateCondition(groupIndex, conditionIndex, condition);
                }
            }

            if (primaryLevel == null) {
                throw new BizException(ResultCode.PARAM_ERROR, "告警规则至少需要一个有效级别块");
            }

            return new NormalizedCondition(objectMapper.writeValueAsString(root), primaryLevel);
        } catch (JsonProcessingException exception) {
            throw new BizException(ResultCode.PARAM_ERROR, "告警规则必须使用合法的结构化 JSON");
        }
    }

    private NormalizedNotifyConfig normalizeNotifyConfig(String rawNotifyConfig) {
        if (rawNotifyConfig == null || rawNotifyConfig.isBlank()) {
            return new NormalizedNotifyConfig(null);
        }

        try {
            JsonNode root = objectMapper.readTree(rawNotifyConfig.trim());
            if (!root.isObject()) {
                throw new BizException(ResultCode.PARAM_ERROR, "通知配置必须是合法的 JSON 对象");
            }

            Set<String> channels = normalizeStringSet(root.get("channels"), "通知方式");
            Set<String> recipientGroupCodes = normalizeStringSet(root.get("recipientGroupCodes"), "接收组");
            Set<String> recipientUsernames = normalizeStringSet(root.get("recipientUsernames"), "接收人");

            if (channels.isEmpty() && recipientGroupCodes.isEmpty() && recipientUsernames.isEmpty()) {
                return new NormalizedNotifyConfig(null);
            }
            if (channels.isEmpty()) {
                throw new BizException(ResultCode.PARAM_ERROR, "请至少选择一种通知方式");
            }
            if (recipientGroupCodes.isEmpty() && recipientUsernames.isEmpty()) {
                throw new BizException(ResultCode.PARAM_ERROR, "请至少选择一个告警接收组或指定接收人");
            }
            if (!SUPPORTED_NOTIFY_CHANNEL_TYPES.containsAll(channels)) {
                Set<String> unsupportedChannels = new LinkedHashSet<>(channels);
                unsupportedChannels.removeAll(SUPPORTED_NOTIFY_CHANNEL_TYPES);
                throw new BizException(ResultCode.PARAM_ERROR, "存在不支持的通知方式: " + String.join(", ", unsupportedChannels));
            }

            ObjectNode normalizedNode = objectMapper.createObjectNode();
            normalizedNode.put("version", 1);
            normalizedNode.set("channels", objectMapper.valueToTree(channels));
            normalizedNode.set("recipientGroupCodes", objectMapper.valueToTree(recipientGroupCodes));
            normalizedNode.set("recipientUsernames", objectMapper.valueToTree(recipientUsernames));
            return new NormalizedNotifyConfig(objectMapper.writeValueAsString(normalizedNode));
        } catch (JsonProcessingException exception) {
            throw new BizException(ResultCode.PARAM_ERROR, "通知配置必须使用合法的 JSON");
        }
    }

    private void validateCondition(int groupIndex, int conditionIndex, JsonNode condition) {
        if (condition == null || !condition.isObject()) {
            throw new BizException(ResultCode.PARAM_ERROR, buildConditionMessage(groupIndex, conditionIndex, "条件格式不正确"));
        }

        String type = requireText(condition, "type", buildConditionMessage(groupIndex, conditionIndex, "缺少触发方式"));
        if (!SUPPORTED_CONDITION_TYPES.contains(type)) {
            throw new BizException(ResultCode.PARAM_ERROR, buildConditionMessage(groupIndex, conditionIndex, "不支持的触发方式: " + type));
        }

        if ("CUSTOM".equals(type)) {
            requireText(condition, "customExpr", buildConditionMessage(groupIndex, conditionIndex, "自定义表达式不能为空"));
            return;
        }

        requireText(condition, "metricKey", buildConditionMessage(groupIndex, conditionIndex, "缺少指标标识"));
        requireNumber(condition, "threshold", buildConditionMessage(groupIndex, conditionIndex, "缺少触发阈值"));

        if ("THRESHOLD".equals(type)) {
            requireText(condition, "aggregateType", buildConditionMessage(groupIndex, conditionIndex, "缺少统计口径"));
            requireText(condition, "operator", buildConditionMessage(groupIndex, conditionIndex, "缺少比较符"));
            return;
        }

        if ("CONTINUOUS".equals(type)) {
            requireText(condition, "operator", buildConditionMessage(groupIndex, conditionIndex, "缺少比较符"));
            requirePositiveInteger(condition, "consecutiveCount", buildConditionMessage(groupIndex, conditionIndex, "缺少连续次数"));
            return;
        }

        requireText(condition, "aggregateType", buildConditionMessage(groupIndex, conditionIndex, "缺少统计口径"));
        requirePositiveInteger(condition, "windowSize", buildConditionMessage(groupIndex, conditionIndex, "缺少统计窗口"));
        requireText(condition, "windowUnit", buildConditionMessage(groupIndex, conditionIndex, "缺少时间单位"));

        if ("ACCUMULATE".equals(type)) {
            requireText(condition, "operator", buildConditionMessage(groupIndex, conditionIndex, "缺少比较符"));
            return;
        }

        requireText(condition, "compareTarget", buildConditionMessage(groupIndex, conditionIndex, "缺少对标方式"));
        requireText(condition, "changeMode", buildConditionMessage(groupIndex, conditionIndex, "缺少变化口径"));
        requireText(condition, "changeDirection", buildConditionMessage(groupIndex, conditionIndex, "缺少变化方向"));
    }

    private AlarmLevel parseLevel(String rawLevel) {
        try {
            return AlarmLevel.valueOf(rawLevel);
        } catch (IllegalArgumentException exception) {
            throw new BizException(ResultCode.PARAM_ERROR, "不支持的告警级别: " + rawLevel);
        }
    }

    private AlarmLevel pickHigherLevel(AlarmLevel current, AlarmLevel candidate) {
        int currentIndex = LEVEL_PRIORITY.indexOf(current);
        int candidateIndex = LEVEL_PRIORITY.indexOf(candidate);
        if (candidateIndex >= 0 && (currentIndex < 0 || candidateIndex < currentIndex)) {
            return candidate;
        }
        return current;
    }

    private String requireText(JsonNode root, String fieldName, String errorMessage) {
        String value = root.path(fieldName).asText("").trim();
        if (value.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, errorMessage);
        }
        return value;
    }

    private double requireNumber(JsonNode root, String fieldName, String errorMessage) {
        JsonNode value = root.get(fieldName);
        if (value == null || !value.isNumber()) {
            throw new BizException(ResultCode.PARAM_ERROR, errorMessage);
        }
        return value.asDouble();
    }

    private int requirePositiveInteger(JsonNode root, String fieldName, String errorMessage) {
        JsonNode value = root.get(fieldName);
        if (value == null || !value.canConvertToInt() || value.asInt() <= 0) {
            throw new BizException(ResultCode.PARAM_ERROR, errorMessage);
        }
        return value.asInt();
    }

    private Set<String> normalizeStringSet(JsonNode node, String fieldName) {
        if (node == null || node.isNull()) {
            return Set.of();
        }
        if (!node.isArray()) {
            throw new BizException(ResultCode.PARAM_ERROR, fieldName + "必须是数组");
        }

        Set<String> values = new LinkedHashSet<>();
        node.forEach(item -> {
            if (!item.isTextual()) {
                throw new BizException(ResultCode.PARAM_ERROR, fieldName + "只能包含字符串");
            }
            String value = item.asText().trim();
            if (!value.isEmpty()) {
                values.add(value);
            }
        });
        return values;
    }

    private String buildGroupMessage(int groupIndex, String message) {
        return "第 " + (groupIndex + 1) + " 个级别块" + message;
    }

    private String buildConditionMessage(int groupIndex, int conditionIndex, String message) {
        return "第 " + (groupIndex + 1) + " 个级别块的第 " + (conditionIndex + 1) + " 条条件" + message;
    }

    private record NormalizedCondition(String conditionExpr, AlarmLevel level) {
    }

    private record NormalizedNotifyConfig(String notifyConfig) {
    }
}
