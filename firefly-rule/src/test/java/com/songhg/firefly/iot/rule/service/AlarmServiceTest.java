package com.songhg.firefly.iot.rule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRuleCreateDTO;
import com.songhg.firefly.iot.rule.dto.alarmruntime.AlarmChannelOption;
import com.songhg.firefly.iot.rule.dto.alarmruntime.AlarmRecipientUser;
import com.songhg.firefly.iot.rule.entity.AlarmRule;
import com.songhg.firefly.iot.rule.mapper.AlarmRecordMapper;
import com.songhg.firefly.iot.rule.mapper.AlarmRuleMapper;
import com.songhg.firefly.iot.rule.mapper.AlarmRuntimeMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AlarmServiceTest {

    @Mock
    private AlarmRuleMapper alarmRuleMapper;

    @Mock
    private AlarmRecordMapper alarmRecordMapper;

    @Mock
    private AlarmRuntimeMapper alarmRuntimeMapper;

    private AlarmService alarmService;

    @BeforeEach
    void setUp() {
        AppContextHolder.setTenantId(2001L);
        AppContextHolder.setUserId(100L);
        alarmService = new AlarmService(alarmRuleMapper, alarmRecordMapper, alarmRuntimeMapper, new ObjectMapper());
    }

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void shouldRejectThresholdConditionWithNonLatestAggregate() {
        AlarmRuleCreateDTO dto = buildCreateDto(
                """
                        {"mode":"STRUCTURED","version":3,"groups":[{"level":"WARNING","triggerMode":"ALL","conditions":[{"type":"THRESHOLD","metricKey":"temperature","aggregateType":"AVG","operator":"GT","threshold":80}]}]}
                        """,
                null
        );

        BizException ex = assertThrows(BizException.class, () -> alarmService.createAlarmRule(dto));

        assertEquals(ResultCode.PARAM_ERROR.getCode(), ex.getCode());
        verify(alarmRuleMapper, never()).insert(any(AlarmRule.class));
    }

    @Test
    void shouldRejectNotifyConfigWhenSelectedChannelHasNoAvailableDeliveryChannel() {
        AlarmRuleCreateDTO dto = buildCreateDto(
                """
                        {"mode":"STRUCTURED","version":3,"groups":[{"level":"WARNING","triggerMode":"ALL","conditions":[{"type":"THRESHOLD","metricKey":"temperature","aggregateType":"LATEST","operator":"GT","threshold":80}]}]}
                        """,
                """
                        {"version":1,"channels":["EMAIL"],"recipientGroupCodes":[],"recipientUsernames":["alice"]}
                        """
        );
        AlarmRecipientUser user = new AlarmRecipientUser();
        user.setUserId(201L);
        user.setUsername("alice");
        user.setEmail("alice@example.com");

        when(alarmRuntimeMapper.selectAvailableChannelsByTypes(anyLong(), anyList())).thenReturn(List.of());

        BizException ex = assertThrows(BizException.class, () -> alarmService.createAlarmRule(dto));

        assertEquals(ResultCode.PARAM_ERROR.getCode(), ex.getCode());
        verify(alarmRuleMapper, never()).insert(any(AlarmRule.class));
    }

    @Test
    void shouldRejectDeleteRuleWhenHistoryExists() {
        AlarmRule rule = new AlarmRule();
        rule.setId(101L);
        rule.setTenantId(2001L);
        rule.setName("rule-1");

        when(alarmRuleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(rule);
        when(alarmRecordMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(1L);

        BizException ex = assertThrows(BizException.class, () -> alarmService.deleteAlarmRule(101L));

        assertEquals(ResultCode.CONFLICT.getCode(), ex.getCode());
    }

    @Test
    void shouldCanonicalizeAndPersistNotifyConfigWhenRuleIsValid() {
        AlarmRuleCreateDTO dto = buildCreateDto(
                """
                        {"mode":"STRUCTURED","version":3,"groups":[{"level":"WARNING","triggerMode":"ALL","conditions":[{"type":"THRESHOLD","metricKey":"temperature","aggregateType":"LATEST","operator":"GT","threshold":80}]}]}
                        """,
                """
                        {"version":1,"channels":["EMAIL","IN_APP"],"recipientGroupCodes":["ARG001"],"recipientUsernames":["alice"]}
                        """
        );
        AlarmChannelOption email = new AlarmChannelOption();
        email.setId(11L);
        email.setType("EMAIL");
        AlarmChannelOption inApp = new AlarmChannelOption();
        inApp.setId(12L);
        inApp.setType("IN_APP");
        AlarmRecipientUser user = new AlarmRecipientUser();
        user.setUserId(201L);
        user.setUsername("alice");
        user.setEmail("alice@example.com");

        when(alarmRuntimeMapper.selectAvailableChannelsByTypes(anyLong(), anyList())).thenReturn(List.of(email, inApp));
        when(alarmRuntimeMapper.selectExistingGroupCodes(anyLong(), anyList())).thenReturn(List.of("ARG001"));
        when(alarmRuntimeMapper.selectActiveGroupUsers(anyLong(), anyList())).thenReturn(List.of(user));
        when(alarmRuntimeMapper.selectActiveUsersByUsernames(anyLong(), anyList())).thenReturn(List.of(user));

        alarmService.createAlarmRule(dto);

        verify(alarmRuleMapper).insert(any(AlarmRule.class));
    }

    private AlarmRuleCreateDTO buildCreateDto(String conditionExpr, String notifyConfig) {
        AlarmRuleCreateDTO dto = new AlarmRuleCreateDTO();
        dto.setName("告警规则");
        dto.setConditionExpr(conditionExpr);
        dto.setNotifyConfig(notifyConfig);
        return dto;
    }
}
