package com.songhg.firefly.iot.rule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.RuleActionType;
import com.songhg.firefly.iot.common.enums.RuleEngineStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.rule.dto.ruleengine.RuleActionDTO;
import com.songhg.firefly.iot.rule.dto.ruleengine.RuleEngineCreateDTO;
import com.songhg.firefly.iot.rule.dto.ruleengine.RuleEngineQueryDTO;
import com.songhg.firefly.iot.rule.dto.ruleengine.RuleEngineUpdateDTO;
import com.songhg.firefly.iot.rule.dto.ruleengine.RuleEngineVO;
import com.songhg.firefly.iot.rule.entity.RuleAction;
import com.songhg.firefly.iot.rule.entity.RuleEngine;
import com.songhg.firefly.iot.rule.mapper.RuleActionMapper;
import com.songhg.firefly.iot.rule.mapper.RuleEngineMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RuleEngineServiceTest {

    @Mock
    private RuleEngineMapper ruleEngineMapper;

    @Mock
    private RuleActionMapper ruleActionMapper;

    private RuleEngineService ruleEngineService;

    @BeforeEach
    void setUp() {
        ruleEngineService = new RuleEngineService(ruleEngineMapper, ruleActionMapper, new ObjectMapper());
        AppContextHolder.setTenantId(2001L);
        AppContextHolder.setUserId(3001L);
    }

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void createRuleShouldNormalizeActionConfigAndDefaults() {
        RuleEngineCreateDTO dto = new RuleEngineCreateDTO();
        dto.setName("  Temperature Alert  ");
        dto.setDescription("  trigger alert  ");
        dto.setSqlExpr("  SELECT * FROM topic WHERE payload.temp > 50  ");

        RuleActionDTO action = new RuleActionDTO();
        action.setActionType(RuleActionType.WEBHOOK);
        action.setActionConfig("{\"url\":\"https://example.com/hook\",\"method\":\"POST\"}");
        dto.setActions(List.of(action));

        doAnswer(invocation -> {
            RuleEngine entity = invocation.getArgument(0);
            entity.setId(88L);
            return 1;
        }).when(ruleEngineMapper).insert(any(RuleEngine.class));

        when(ruleActionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        RuleEngineVO result = ruleEngineService.createRule(dto);

        ArgumentCaptor<RuleEngine> ruleCaptor = ArgumentCaptor.forClass(RuleEngine.class);
        verify(ruleEngineMapper).insert(ruleCaptor.capture());
        RuleEngine savedRule = ruleCaptor.getValue();
        assertEquals("Temperature Alert", savedRule.getName());
        assertEquals("trigger alert", savedRule.getDescription());
        assertEquals("SELECT * FROM topic WHERE payload.temp > 50", savedRule.getSqlExpr());
        assertEquals(2001L, savedRule.getTenantId());
        assertEquals(3001L, savedRule.getCreatedBy());
        assertEquals(RuleEngineStatus.DISABLED, savedRule.getStatus());

        ArgumentCaptor<RuleAction> actionCaptor = ArgumentCaptor.forClass(RuleAction.class);
        verify(ruleActionMapper).insert(actionCaptor.capture());
        RuleAction savedAction = actionCaptor.getValue();
        assertEquals(88L, savedAction.getRuleId());
        assertEquals("{\"url\":\"https://example.com/hook\",\"method\":\"POST\"}", savedAction.getActionConfig());
        assertEquals(0, savedAction.getSortOrder());
        assertTrue(savedAction.getEnabled());

        assertEquals(88L, result.getId());
        assertTrue(result.getActions().isEmpty());
    }

    @Test
    void createRuleShouldRejectInvalidActionConfigJson() {
        RuleEngineCreateDTO dto = new RuleEngineCreateDTO();
        dto.setName("Rule");
        dto.setSqlExpr("SELECT * FROM topic");

        RuleActionDTO action = new RuleActionDTO();
        action.setActionType(RuleActionType.WEBHOOK);
        action.setActionConfig("{bad json}");
        dto.setActions(List.of(action));

        BizException ex = assertThrows(BizException.class, () -> ruleEngineService.createRule(dto));
        assertEquals(1001, ex.getCode());
        assertEquals("rule action config must be valid JSON", ex.getMessage());
        verify(ruleEngineMapper, never()).insert(any(RuleEngine.class));
    }

    @Test
    void createRuleShouldRejectUnsupportedActionType() {
        RuleEngineCreateDTO dto = new RuleEngineCreateDTO();
        dto.setName("Rule");
        dto.setSqlExpr("SELECT * FROM topic");
        dto.setActions(List.of(buildActionDto(RuleActionType.DB_WRITE, "{\"table\":\"iot_rule_events\"}")));

        BizException ex = assertThrows(BizException.class, () -> ruleEngineService.createRule(dto));
        assertEquals(1001, ex.getCode());
        assertEquals("rule action type DB_WRITE is not supported", ex.getMessage());
        verify(ruleEngineMapper, never()).insert(any(RuleEngine.class));
    }

    @Test
    void getRuleByIdShouldUseTenantScopedLookup() {
        RuleEngine rule = buildRule(12L, "Scoped Rule");
        when(ruleEngineMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(rule);
        when(ruleActionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        RuleEngineVO result = ruleEngineService.getRuleById(12L);

        assertEquals(12L, result.getId());
        verify(ruleEngineMapper, never()).selectById(any());
    }

    @Test
    void listRulesShouldLoadActionsInBatch() {
        RuleEngineQueryDTO query = new RuleEngineQueryDTO();
        query.setPageNum(1);
        query.setPageSize(20);

        RuleEngine firstRule = buildRule(1L, "Rule A");
        RuleEngine secondRule = buildRule(2L, "Rule B");
        Page<RuleEngine> page = new Page<>(1, 20, 2);
        page.setRecords(List.of(firstRule, secondRule));

        RuleAction firstAction = new RuleAction();
        firstAction.setRuleId(1L);
        firstAction.setActionType(RuleActionType.WEBHOOK);
        firstAction.setActionConfig("{\"url\":\"https://a\"}");
        firstAction.setSortOrder(1);
        firstAction.setEnabled(true);

        RuleAction secondAction = new RuleAction();
        secondAction.setRuleId(2L);
        secondAction.setActionType(RuleActionType.EMAIL);
        secondAction.setActionConfig("{\"to\":\"ops@example.com\"}");
        secondAction.setSortOrder(1);
        secondAction.setEnabled(true);

        when(ruleEngineMapper.selectPage(any(Page.class), any(LambdaQueryWrapper.class))).thenReturn(page);
        when(ruleActionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(firstAction, secondAction));

        IPage<RuleEngineVO> result = ruleEngineService.listRules(query);

        assertEquals(2, result.getRecords().size());
        assertEquals(1, result.getRecords().get(0).getActions().size());
        assertEquals(RuleActionType.WEBHOOK, result.getRecords().get(0).getActions().get(0).getActionType());
        assertEquals(RuleActionType.EMAIL, result.getRecords().get(1).getActions().get(0).getActionType());
        verify(ruleActionMapper).selectList(any(LambdaQueryWrapper.class));
    }

    @Test
    void updateRuleShouldAllowClearingDescriptionAndProjectScope() {
        RuleEngine existingRule = buildRule(18L, "Old Rule");
        existingRule.setProjectId(801L);
        existingRule.setDescription("legacy description");
        existingRule.setSqlExpr("SELECT * FROM 'PROPERTY_REPORT'");

        RuleEngineUpdateDTO dto = new RuleEngineUpdateDTO();
        dto.setName("  Updated Rule  ");
        dto.setDescription("   ");
        dto.setProjectId(null);
        dto.setSqlExpr("  SELECT * FROM 'EVENT_REPORT'  ");
        dto.setActions(List.of(buildActionDto(
                RuleActionType.KAFKA_FORWARD,
                "{\"topic\":\"runtime.alerts\",\"payload\":{\"code\":\"${code}\"}}"
        )));

        when(ruleEngineMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(existingRule);
        when(ruleActionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(buildAction(
                18L,
                RuleActionType.KAFKA_FORWARD,
                "{\"topic\":\"runtime.alerts\",\"payload\":{\"code\":\"${code}\"}}"
        )));

        RuleEngineVO result = ruleEngineService.updateRule(18L, dto);

        ArgumentCaptor<RuleEngine> ruleCaptor = ArgumentCaptor.forClass(RuleEngine.class);
        verify(ruleEngineMapper).updateById(ruleCaptor.capture());
        RuleEngine savedRule = ruleCaptor.getValue();
        assertEquals("Updated Rule", savedRule.getName());
        assertEquals("SELECT * FROM 'EVENT_REPORT'", savedRule.getSqlExpr());
        assertEquals(null, savedRule.getDescription());
        assertEquals(null, savedRule.getProjectId());

        verify(ruleActionMapper).delete(any(LambdaQueryWrapper.class));
        verify(ruleActionMapper).insert(any(RuleAction.class));
        assertEquals(null, result.getDescription());
        assertEquals(null, result.getProjectId());
    }

    @Test
    void enableRuleShouldRejectUnsupportedEnabledAction() {
        RuleEngine rule = buildRule(21L, "Bad Rule");
        RuleAction action = buildAction(21L, RuleActionType.DB_WRITE, "{\"table\":\"alarm_records\"}");
        action.setEnabled(true);

        when(ruleEngineMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(rule);
        when(ruleActionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(action));

        BizException ex = assertThrows(BizException.class, () -> ruleEngineService.enableRule(21L));
        assertEquals(1001, ex.getCode());
        assertEquals("rule action type DB_WRITE is not supported", ex.getMessage());
        verify(ruleEngineMapper, never()).updateById(any(RuleEngine.class));
    }

    @Test
    void enableRuleShouldRejectRuleWithoutEnabledRuntimeAction() {
        RuleEngine rule = buildRule(22L, "Disabled Actions");
        RuleAction action = buildAction(22L, RuleActionType.WEBHOOK, "{\"url\":\"https://example.com/hook\"}");
        action.setEnabled(false);

        when(ruleEngineMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(rule);
        when(ruleActionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(action));

        BizException ex = assertThrows(BizException.class, () -> ruleEngineService.enableRule(22L));
        assertEquals(1001, ex.getCode());
        assertEquals("rule must contain at least one enabled runtime action", ex.getMessage());
        verify(ruleEngineMapper, never()).updateById(any(RuleEngine.class));
    }

    private RuleActionDTO buildActionDto(RuleActionType actionType, String actionConfig) {
        RuleActionDTO action = new RuleActionDTO();
        action.setActionType(actionType);
        action.setActionConfig(actionConfig);
        return action;
    }

    private RuleAction buildAction(Long ruleId, RuleActionType actionType, String actionConfig) {
        RuleAction action = new RuleAction();
        action.setRuleId(ruleId);
        action.setActionType(actionType);
        action.setActionConfig(actionConfig);
        action.setSortOrder(1);
        action.setEnabled(true);
        return action;
    }

    private RuleEngine buildRule(Long id, String name) {
        RuleEngine rule = new RuleEngine();
        rule.setId(id);
        rule.setTenantId(2001L);
        rule.setName(name);
        rule.setSqlExpr("SELECT * FROM topic");
        rule.setStatus(RuleEngineStatus.DISABLED);
        rule.setTriggerCount(0L);
        rule.setSuccessCount(0L);
        rule.setErrorCount(0L);
        return rule;
    }
}
