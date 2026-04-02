package com.songhg.firefly.iot.rule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.RuleActionType;
import com.songhg.firefly.iot.common.enums.RuleEngineStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.mybatis.DataScope;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.rule.convert.RuleEngineConvert;
import com.songhg.firefly.iot.rule.dto.ruleengine.RuleActionDTO;
import com.songhg.firefly.iot.rule.dto.ruleengine.RuleEngineCreateDTO;
import com.songhg.firefly.iot.rule.dto.ruleengine.RuleEngineQueryDTO;
import com.songhg.firefly.iot.rule.dto.ruleengine.RuleEngineUpdateDTO;
import com.songhg.firefly.iot.rule.dto.ruleengine.RuleEngineVO;
import com.songhg.firefly.iot.rule.entity.RuleAction;
import com.songhg.firefly.iot.rule.entity.RuleEngine;
import com.songhg.firefly.iot.rule.mapper.RuleActionMapper;
import com.songhg.firefly.iot.rule.mapper.RuleEngineMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class RuleEngineService {

    private static final Set<RuleActionType> SUPPORTED_RUNTIME_ACTION_TYPES = EnumSet.of(
            RuleActionType.KAFKA_FORWARD,
            RuleActionType.WEBHOOK,
            RuleActionType.EMAIL,
            RuleActionType.SMS,
            RuleActionType.DEVICE_COMMAND
    );

    private final RuleEngineMapper ruleEngineMapper;
    private final RuleActionMapper ruleActionMapper;
    private final ObjectMapper objectMapper;

    @Transactional
    public RuleEngineVO createRule(RuleEngineCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();
        sanitizeCreatePayload(dto);
        validateConfiguredActions(dto.getActions());
        normalizeActionConfigs(dto.getActions());

        RuleEngine rule = RuleEngineConvert.INSTANCE.toEntity(dto);
        rule.setTenantId(tenantId);
        rule.setStatus(RuleEngineStatus.DISABLED);
        rule.setTriggerCount(0L);
        rule.setSuccessCount(0L);
        rule.setErrorCount(0L);
        rule.setCreatedBy(userId);
        ruleEngineMapper.insert(rule);

        if (dto.getActions() != null) {
            saveActions(rule.getId(), dto.getActions());
        }

        log.info("Rule created: id={}, name={}, tenantId={}", rule.getId(), rule.getName(), tenantId);
        return buildVO(rule);
    }

    public RuleEngineVO getRuleById(Long id) {
        return buildVO(requireOwnedRule(id));
    }

    @DataScope(projectColumn = "project_id", productColumn = "", deviceColumn = "", groupColumn = "")
    public IPage<RuleEngineVO> listRules(RuleEngineQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<RuleEngine> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<RuleEngine> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(RuleEngine::getTenantId, tenantId);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.like(RuleEngine::getName, query.getKeyword().trim());
        }
        if (query.getStatus() != null) {
            wrapper.eq(RuleEngine::getStatus, query.getStatus());
        }
        if (query.getProjectId() != null) {
            wrapper.eq(RuleEngine::getProjectId, query.getProjectId());
        }
        wrapper.orderByDesc(RuleEngine::getCreatedAt);

        IPage<RuleEngine> result = ruleEngineMapper.selectPage(page, wrapper);
        return buildPage(result);
    }

    @Transactional
    public RuleEngineVO updateRule(Long id, RuleEngineUpdateDTO dto) {
        sanitizeUpdatePayload(dto);
        validateConfiguredActions(dto.getActions());
        normalizeActionConfigs(dto.getActions());
        RuleEngine rule = requireOwnedRule(id);
        applyUpdatePayload(dto, rule);
        ruleEngineMapper.updateById(rule);

        if (dto.getActions() != null) {
            ruleActionMapper.delete(new LambdaQueryWrapper<RuleAction>().eq(RuleAction::getRuleId, id));
            saveActions(id, dto.getActions());
        }

        return buildVO(rule);
    }

    @Transactional
    public void enableRule(Long id) {
        RuleEngine rule = requireOwnedRule(id);
        validateEnabledRuntimeActions(loadActionsByRuleId(id));
        rule.setStatus(RuleEngineStatus.ENABLED);
        ruleEngineMapper.updateById(rule);
        log.info("Rule enabled: id={}, name={}", id, rule.getName());
    }

    @Transactional
    public void disableRule(Long id) {
        RuleEngine rule = requireOwnedRule(id);
        rule.setStatus(RuleEngineStatus.DISABLED);
        ruleEngineMapper.updateById(rule);
        log.info("Rule disabled: id={}, name={}", id, rule.getName());
    }

    @Transactional
    public void deleteRule(Long id) {
        RuleEngine rule = requireOwnedRule(id);
        ruleEngineMapper.deleteById(id);
        log.info("Rule deleted: id={}, name={}", id, rule.getName());
    }

    private void saveActions(Long ruleId, List<RuleActionDTO> actions) {
        for (RuleActionDTO actionDTO : actions) {
            RuleAction action = RuleEngineConvert.INSTANCE.toActionEntity(actionDTO);
            action.setRuleId(ruleId);
            action.setActionConfig(actionDTO.getActionConfig());
            if (action.getSortOrder() == null) {
                action.setSortOrder(0);
            }
            if (action.getEnabled() == null) {
                action.setEnabled(true);
            }
            ruleActionMapper.insert(action);
        }
    }

    private List<RuleAction> loadActionsByRuleId(Long ruleId) {
        return ruleActionMapper.selectList(new LambdaQueryWrapper<RuleAction>()
                .eq(RuleAction::getRuleId, ruleId)
                .orderByAsc(RuleAction::getSortOrder)
                .orderByAsc(RuleAction::getId));
    }

    private void normalizeActionConfigs(List<RuleActionDTO> actions) {
        if (actions == null) {
            return;
        }
        for (RuleActionDTO action : actions) {
            action.setActionConfig(normalizeActionConfig(action.getActionConfig()));
        }
    }

    private void sanitizeCreatePayload(RuleEngineCreateDTO dto) {
        dto.setName(normalizeRequiredText(dto.getName(), "rule name"));
        dto.setDescription(normalizeOptionalText(dto.getDescription()));
        dto.setSqlExpr(normalizeRequiredText(dto.getSqlExpr(), "rule expression"));
    }

    private void sanitizeUpdatePayload(RuleEngineUpdateDTO dto) {
        if (dto.getName() != null) {
            dto.setName(normalizeRequiredText(dto.getName(), "rule name"));
        }
        dto.setDescription(normalizeOptionalText(dto.getDescription()));
        if (dto.getSqlExpr() != null) {
            dto.setSqlExpr(normalizeRequiredText(dto.getSqlExpr(), "rule expression"));
        }
    }

    private void validateConfiguredActions(List<RuleActionDTO> actions) {
        if (actions == null || actions.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "rule must contain at least one action");
        }
        for (RuleActionDTO action : actions) {
            if (action == null || action.getActionType() == null) {
                throw new BizException(ResultCode.PARAM_ERROR, "rule action type is required");
            }
            if (!SUPPORTED_RUNTIME_ACTION_TYPES.contains(action.getActionType())) {
                throw new BizException(ResultCode.PARAM_ERROR,
                        "rule action type " + action.getActionType().getValue() + " is not supported");
            }
        }
    }

    private void validateEnabledRuntimeActions(List<RuleAction> actions) {
        if (actions == null || actions.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "rule must contain at least one action");
        }

        boolean hasEnabledRuntimeAction = false;
        for (RuleAction action : actions) {
            if (action == null || !Boolean.TRUE.equals(action.getEnabled())) {
                continue;
            }
            if (!SUPPORTED_RUNTIME_ACTION_TYPES.contains(action.getActionType())) {
                throw new BizException(ResultCode.PARAM_ERROR,
                        "rule action type " + action.getActionType().getValue() + " is not supported");
            }
            hasEnabledRuntimeAction = true;
        }

        if (!hasEnabledRuntimeAction) {
            throw new BizException(ResultCode.PARAM_ERROR, "rule must contain at least one enabled runtime action");
        }
    }

    private void applyUpdatePayload(RuleEngineUpdateDTO dto, RuleEngine rule) {
        if (dto.getName() != null) {
            rule.setName(dto.getName());
        }
        if (dto.getSqlExpr() != null) {
            rule.setSqlExpr(dto.getSqlExpr());
        }
        // PUT updates come from the full edit form, so null means "clear this optional field".
        rule.setDescription(dto.getDescription());
        rule.setProjectId(dto.getProjectId());
    }

    private String normalizeRequiredText(String value, String fieldName) {
        String normalized = normalizeOptionalText(value);
        if (normalized == null) {
            throw new BizException(ResultCode.PARAM_ERROR, fieldName + " cannot be blank");
        }
        return normalized;
    }

    private String normalizeOptionalText(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String normalizeActionConfig(String actionConfig) {
        if (actionConfig == null || actionConfig.isBlank()) {
            return "{}";
        }
        try {
            return objectMapper.writeValueAsString(objectMapper.readTree(actionConfig));
        } catch (JsonProcessingException ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "rule action config must be valid JSON");
        }
    }

    private RuleEngine requireOwnedRule(Long id) {
        Long tenantId = AppContextHolder.getTenantId();
        RuleEngine rule = ruleEngineMapper.selectOne(new LambdaQueryWrapper<RuleEngine>()
                .eq(RuleEngine::getId, id)
                .eq(RuleEngine::getTenantId, tenantId));
        if (rule == null) {
            throw new BizException(ResultCode.RULE_ENGINE_NOT_FOUND);
        }
        return rule;
    }

    private RuleEngineVO buildVO(RuleEngine rule) {
        return buildVOs(Collections.singletonList(rule)).get(0);
    }

    private IPage<RuleEngineVO> buildPage(IPage<RuleEngine> page) {
        Page<RuleEngineVO> result = new Page<>(page.getCurrent(), page.getSize(), page.getTotal());
        result.setRecords(buildVOs(page.getRecords()));
        return result;
    }

    /**
     * Batch loads actions for the current page to avoid N+1 action queries.
     */
    private List<RuleEngineVO> buildVOs(List<RuleEngine> rules) {
        if (rules == null || rules.isEmpty()) {
            return List.of();
        }
        List<Long> ruleIds = rules.stream().map(RuleEngine::getId).toList();
        Map<Long, List<RuleActionDTO>> actionMap = ruleActionMapper.selectList(
                        new LambdaQueryWrapper<RuleAction>()
                                .in(RuleAction::getRuleId, ruleIds)
                                .orderByAsc(RuleAction::getRuleId)
                                .orderByAsc(RuleAction::getSortOrder))
                .stream()
                .collect(Collectors.groupingBy(
                        RuleAction::getRuleId,
                        LinkedHashMap::new,
                        Collectors.mapping(RuleEngineConvert.INSTANCE::toActionDTO, Collectors.toList())));

        return rules.stream().map(rule -> {
            RuleEngineVO vo = RuleEngineConvert.INSTANCE.toVO(rule);
            vo.setActions(actionMap.getOrDefault(rule.getId(), List.of()));
            return vo;
        }).toList();
    }
}
