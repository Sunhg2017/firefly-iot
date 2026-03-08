package com.songhg.firefly.iot.rule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.common.context.UserContextHolder;
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

import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class RuleEngineService {

    private final RuleEngineMapper ruleEngineMapper;
    private final RuleActionMapper ruleActionMapper;

    @Transactional
    public RuleEngineVO createRule(RuleEngineCreateDTO dto) {
        Long tenantId = TenantContextHolder.getTenantId();
        Long userId = UserContextHolder.getUserId();

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
        RuleEngine rule = ruleEngineMapper.selectById(id);
        if (rule == null) {
            throw new BizException(ResultCode.RULE_ENGINE_NOT_FOUND);
        }
        return buildVO(rule);
    }

    @DataScope
    public IPage<RuleEngineVO> listRules(RuleEngineQueryDTO query) {
        Long tenantId = TenantContextHolder.getTenantId();
        Page<RuleEngine> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<RuleEngine> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(RuleEngine::getTenantId, tenantId);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.like(RuleEngine::getName, query.getKeyword());
        }
        if (query.getStatus() != null) {
            wrapper.eq(RuleEngine::getStatus, query.getStatus());
        }
        if (query.getProjectId() != null) {
            wrapper.eq(RuleEngine::getProjectId, query.getProjectId());
        }
        wrapper.orderByDesc(RuleEngine::getCreatedAt);

        IPage<RuleEngine> result = ruleEngineMapper.selectPage(page, wrapper);
        return result.convert(this::buildVO);
    }

    @Transactional
    public RuleEngineVO updateRule(Long id, RuleEngineUpdateDTO dto) {
        RuleEngine rule = ruleEngineMapper.selectById(id);
        if (rule == null) {
            throw new BizException(ResultCode.RULE_ENGINE_NOT_FOUND);
        }
        RuleEngineConvert.INSTANCE.updateEntity(dto, rule);
        ruleEngineMapper.updateById(rule);

        if (dto.getActions() != null) {
            ruleActionMapper.delete(new LambdaQueryWrapper<RuleAction>().eq(RuleAction::getRuleId, id));
            saveActions(id, dto.getActions());
        }

        return buildVO(rule);
    }

    @Transactional
    public void enableRule(Long id) {
        RuleEngine rule = ruleEngineMapper.selectById(id);
        if (rule == null) {
            throw new BizException(ResultCode.RULE_ENGINE_NOT_FOUND);
        }
        rule.setStatus(RuleEngineStatus.ENABLED);
        ruleEngineMapper.updateById(rule);
        log.info("Rule enabled: id={}, name={}", id, rule.getName());
    }

    @Transactional
    public void disableRule(Long id) {
        RuleEngine rule = ruleEngineMapper.selectById(id);
        if (rule == null) {
            throw new BizException(ResultCode.RULE_ENGINE_NOT_FOUND);
        }
        rule.setStatus(RuleEngineStatus.DISABLED);
        ruleEngineMapper.updateById(rule);
        log.info("Rule disabled: id={}, name={}", id, rule.getName());
    }

    @Transactional
    public void deleteRule(Long id) {
        RuleEngine rule = ruleEngineMapper.selectById(id);
        if (rule == null) {
            throw new BizException(ResultCode.RULE_ENGINE_NOT_FOUND);
        }
        ruleEngineMapper.deleteById(id);
        log.info("Rule deleted: id={}, name={}", id, rule.getName());
    }

    private void saveActions(Long ruleId, List<RuleActionDTO> actions) {
        for (RuleActionDTO actionDTO : actions) {
            RuleAction action = RuleEngineConvert.INSTANCE.toActionEntity(actionDTO);
            action.setRuleId(ruleId);
            if (action.getSortOrder() == null) {
                action.setSortOrder(0);
            }
            if (action.getEnabled() == null) {
                action.setEnabled(true);
            }
            ruleActionMapper.insert(action);
        }
    }

    private RuleEngineVO buildVO(RuleEngine rule) {
        RuleEngineVO vo = RuleEngineConvert.INSTANCE.toVO(rule);
        List<RuleAction> actions = ruleActionMapper.selectList(
                new LambdaQueryWrapper<RuleAction>()
                        .eq(RuleAction::getRuleId, rule.getId())
                        .orderByAsc(RuleAction::getSortOrder));
        vo.setActions(actions.stream().map(RuleEngineConvert.INSTANCE::toActionDTO).collect(Collectors.toList()));
        return vo;
    }
}
