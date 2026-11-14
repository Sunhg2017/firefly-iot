package com.songhg.firefly.iot.rule.dataforward.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.DataForwardTargetType;
import com.songhg.firefly.iot.common.enums.ForwardStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.mybatis.DataScope;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.rule.dataforward.dto.DataForwardRuleCreateDTO;
import com.songhg.firefly.iot.rule.dataforward.dto.DataForwardRuleQueryDTO;
import com.songhg.firefly.iot.rule.dataforward.dto.DataForwardRuleUpdateDTO;
import com.songhg.firefly.iot.rule.dataforward.dto.DataForwardRuleVO;
import com.songhg.firefly.iot.rule.dataforward.entity.DataForwardRule;
import com.songhg.firefly.iot.rule.dataforward.mapper.DataForwardRuleMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Slf4j
@Service
@RequiredArgsConstructor
public class DataForwardRuleService {

    private final DataForwardRuleMapper ruleMapper;
    private final ObjectMapper objectMapper;

    @Transactional
    public DataForwardRuleVO create(DataForwardRuleCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();

        DataForwardRule rule = new DataForwardRule();
        BeanUtils.copyProperties(dto, rule);
        rule.setTenantId(tenantId);
        rule.setCreatedBy(userId);
        rule.setStatus(ForwardStatus.DISABLED);
        rule.setTriggerCount(0L);
        rule.setSuccessCount(0L);
        rule.setErrorCount(0L);
        rule.setName(requireText(dto.getName(), "规则名称"));
        rule.setSourcePattern(requireText(dto.getSourcePattern(), "消息源"));
        rule.setMatchCondition(normalizeOptional(dto.getMatchCondition()));
        rule.setTargetType(dto.getTargetType());
        rule.setTargetConfig(normalizeConfig(dto.getTargetConfig(), dto.getTargetType()));

        ruleMapper.insert(rule);
        log.info("Data forward rule created: id={}, name={}, tenantId={}", rule.getId(), rule.getName(), tenantId);
        return buildVO(rule);
    }

    public DataForwardRuleVO getById(Long id) {
        return buildVO(requireOwnedRule(id));
    }

    @DataScope(projectColumn = "project_id", productColumn = "", deviceColumn = "", groupColumn = "")
    public IPage<DataForwardRuleVO> list(DataForwardRuleQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<DataForwardRule> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<DataForwardRule> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(DataForwardRule::getTenantId, tenantId);
        if (StringUtils.hasText(query.getKeyword())) {
            wrapper.like(DataForwardRule::getName, query.getKeyword().trim());
        }
        if (query.getStatus() != null) {
            wrapper.eq(DataForwardRule::getStatus, query.getStatus());
        }
        if (query.getTargetType() != null) {
            wrapper.eq(DataForwardRule::getTargetType, query.getTargetType());
        }
        if (query.getProjectId() != null) {
            wrapper.eq(DataForwardRule::getProjectId, query.getProjectId());
        }
        wrapper.orderByDesc(DataForwardRule::getCreatedAt);

        IPage<DataForwardRule> result = ruleMapper.selectPage(page, wrapper);
        Page<DataForwardRuleVO> voPage = new Page<>(result.getCurrent(), result.getSize(), result.getTotal());
        voPage.setRecords(result.getRecords().stream().map(this::buildVO).toList());
        return voPage;
    }

    @Transactional
    public DataForwardRuleVO update(Long id, DataForwardRuleUpdateDTO dto) {
        DataForwardRule rule = requireOwnedRule(id);
        if (dto.getName() != null) {
            rule.setName(requireText(dto.getName(), "规则名称"));
        }
        rule.setDescription(normalizeOptional(dto.getDescription()));
        rule.setProjectId(dto.getProjectId());
        if (dto.getSourcePattern() != null) {
            rule.setSourcePattern(requireText(dto.getSourcePattern(), "消息源"));
        }
        rule.setMatchCondition(normalizeOptional(dto.getMatchCondition()));
        if (dto.getTargetType() != null) {
            rule.setTargetType(dto.getTargetType());
        }
        if (dto.getTargetConfig() != null) {
            rule.setTargetConfig(normalizeConfig(dto.getTargetConfig(), rule.getTargetType()));
        }
        ruleMapper.updateById(rule);
        return buildVO(rule);
    }

    @Transactional
    public void enable(Long id) {
        DataForwardRule rule = requireOwnedRule(id);
        validateRuntimeConfig(rule);
        rule.setStatus(ForwardStatus.ENABLED);
        ruleMapper.updateById(rule);
        log.info("Data forward rule enabled: id={}, name={}", id, rule.getName());
    }

    @Transactional
    public void disable(Long id) {
        DataForwardRule rule = requireOwnedRule(id);
        rule.setStatus(ForwardStatus.DISABLED);
        ruleMapper.updateById(rule);
        log.info("Data forward rule disabled: id={}, name={}", id, rule.getName());
    }

    @Transactional
    public void delete(Long id) {
        DataForwardRule rule = requireOwnedRule(id);
        ruleMapper.deleteById(id);
        log.info("Data forward rule deleted: id={}, name={}", id, rule.getName());
    }

    private void validateRuntimeConfig(DataForwardRule rule) {
        if (rule.getTargetType() == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "转发目标类型不能为空");
        }
        // 再次校验配置，确保启用前配置有效且包含目标所需字段。
        parseConfig(rule.getTargetConfig(), rule.getTargetType());
    }

    private String normalizeConfig(String rawConfig, DataForwardTargetType targetType) {
        JsonNode node = parseConfig(rawConfig, targetType);
        try {
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "目标配置必须是合法 JSON");
        }
    }

    private JsonNode parseConfig(String rawConfig, DataForwardTargetType targetType) {
        JsonNode node;
        try {
            node = objectMapper.readTree(rawConfig == null ? "{}" : rawConfig);
        } catch (JsonProcessingException ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "目标配置必须是合法 JSON");
        }
        if (targetType == null) {
            return node;
        }
        switch (targetType) {
            case MQTT -> {
                requireConfigField(node, "broker");
                requireConfigField(node, "topic");
            }
            case AMQP -> {
                requireConfigField(node, "host");
                requireConfigField(node, "exchange");
            }
            case TSDB -> {
                requireConfigField(node, "engine");
                requireConfigField(node, "url");
            }
            case WEBHOOK -> requireConfigField(node, "url");
            default -> throw new BizException(ResultCode.PARAM_ERROR, "不支持的转发目标类型: " + targetType.getValue());
        }
        return node;
    }

    private void requireConfigField(JsonNode node, String field) {
        if (node == null || !node.hasNonNull(field) || !StringUtils.hasText(node.get(field).asText())) {
            throw new BizException(ResultCode.PARAM_ERROR, "目标配置缺少必填字段: " + field);
        }
    }

    private DataForwardRule requireOwnedRule(Long id) {
        Long tenantId = AppContextHolder.getTenantId();
        DataForwardRule rule = ruleMapper.selectOne(new LambdaQueryWrapper<DataForwardRule>()
                .eq(DataForwardRule::getId, id)
                .eq(DataForwardRule::getTenantId, tenantId));
        if (rule == null) {
            throw new BizException(ResultCode.DATA_FORWARD_RULE_NOT_FOUND);
        }
        return rule;
    }

    private DataForwardRuleVO buildVO(DataForwardRule rule) {
        DataForwardRuleVO vo = new DataForwardRuleVO();
        BeanUtils.copyProperties(rule, vo);
        return vo;
    }

    private String requireText(String value, String fieldName) {
        String normalized = normalizeOptional(value);
        if (normalized == null) {
            throw new BizException(ResultCode.PARAM_ERROR, fieldName + "不能为空");
        }
        return normalized;
    }

    private String normalizeOptional(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
