package com.songhg.firefly.iot.rule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
        dto.setConditionExpr(normalizedCondition.conditionExpr());
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

        AlarmConvert.INSTANCE.updateRuleEntity(dto, rule);
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

            JsonNode conditions = root.get("conditions");
            if (conditions == null || !conditions.isArray() || conditions.isEmpty()) {
                throw new BizException(ResultCode.PARAM_ERROR, "告警规则至少需要维护一条告警条件");
            }

            AlarmLevel primaryLevel = null;
            for (int index = 0; index < conditions.size(); index++) {
                JsonNode condition = conditions.get(index);
                if (condition == null || !condition.isObject()) {
                    throw new BizException(ResultCode.PARAM_ERROR, "第 " + (index + 1) + " 条告警条件格式不正确");
                }

                AlarmLevel conditionLevel = parseLevel(requireText(condition, "level", "第 " + (index + 1) + " 条告警条件缺少告警级别"));
                primaryLevel = primaryLevel == null ? conditionLevel : pickHigherLevel(primaryLevel, conditionLevel);

                String type = requireText(condition, "type", "第 " + (index + 1) + " 条告警条件缺少触发类型");
                if (!SUPPORTED_CONDITION_TYPES.contains(type)) {
                    throw new BizException(ResultCode.PARAM_ERROR, "第 " + (index + 1) + " 条告警条件触发类型不支持: " + type);
                }

                if ("CUSTOM".equals(type)) {
                    requireText(condition, "customExpr", "第 " + (index + 1) + " 条自定义表达式不能为空");
                    continue;
                }

                requireText(condition, "metricKey", "第 " + (index + 1) + " 条告警条件缺少指标标识");
                requireText(condition, "operator", "第 " + (index + 1) + " 条告警条件缺少比较符");
                requireNumber(condition, "threshold", "第 " + (index + 1) + " 条告警条件缺少触发阈值");

                if ("THRESHOLD".equals(type)) {
                    requireText(condition, "aggregateType", "第 " + (index + 1) + " 条阈值条件缺少统计口径");
                    continue;
                }

                if ("CONTINUOUS".equals(type)) {
                    requirePositiveInteger(condition, "consecutiveCount", "第 " + (index + 1) + " 条连续条件缺少连续次数");
                    continue;
                }

                requireText(condition, "aggregateType", "第 " + (index + 1) + " 条聚合条件缺少统计口径");
                requirePositiveInteger(condition, "windowSize", "第 " + (index + 1) + " 条聚合条件缺少统计窗口");
                requireText(condition, "windowUnit", "第 " + (index + 1) + " 条聚合条件缺少时间单位");

                if ("ACCUMULATE".equals(type)) {
                    continue;
                }

                requireText(condition, "compareTarget", "第 " + (index + 1) + " 条同比/环比条件缺少对标方式");
                requireText(condition, "changeMode", "第 " + (index + 1) + " 条同比/环比条件缺少变化口径");
                requireText(condition, "changeDirection", "第 " + (index + 1) + " 条同比/环比条件缺少变化方向");
            }

            if (primaryLevel == null) {
                throw new BizException(ResultCode.PARAM_ERROR, "告警规则至少需要维护一条有效的告警条件");
            }

            return new NormalizedCondition(objectMapper.writeValueAsString(root), primaryLevel);
        } catch (JsonProcessingException exception) {
            throw new BizException(ResultCode.PARAM_ERROR, "告警规则必须使用结构化条件");
        }
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

    private record NormalizedCondition(String conditionExpr, AlarmLevel level) {
    }
}
