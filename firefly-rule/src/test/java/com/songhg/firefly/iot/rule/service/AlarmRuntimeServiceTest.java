package com.songhg.firefly.iot.rule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.client.DeviceClient;
import com.songhg.firefly.iot.api.client.NotificationClient;
import com.songhg.firefly.iot.api.dto.NotificationRequestDTO;
import com.songhg.firefly.iot.common.enums.AlarmLevel;
import com.songhg.firefly.iot.common.enums.AlarmStatus;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.rule.dto.alarmruntime.AlarmChannelOption;
import com.songhg.firefly.iot.rule.dto.alarmruntime.AlarmMetricAggregate;
import com.songhg.firefly.iot.rule.dto.alarmruntime.AlarmRecipientUser;
import com.songhg.firefly.iot.rule.entity.AlarmRecord;
import com.songhg.firefly.iot.rule.entity.AlarmRule;
import com.songhg.firefly.iot.rule.mapper.AlarmRecordMapper;
import com.songhg.firefly.iot.rule.mapper.AlarmRuleMapper;
import com.songhg.firefly.iot.rule.mapper.AlarmRuntimeMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AlarmRuntimeServiceTest {

    @Mock
    private AlarmRuleMapper alarmRuleMapper;

    @Mock
    private AlarmRecordMapper alarmRecordMapper;

    @Mock
    private AlarmRuntimeMapper alarmRuntimeMapper;

    @Mock
    private DeviceClient deviceClient;

    @Mock
    private NotificationClient notificationClient;

    private AlarmRuntimeService alarmRuntimeService;

    @BeforeEach
    void setUp() {
        alarmRuntimeService = new AlarmRuntimeService(
                alarmRuleMapper,
                alarmRecordMapper,
                alarmRuntimeMapper,
                deviceClient,
                notificationClient,
                new ObjectMapper()
        );
        lenient().when(notificationClient.send(any(NotificationRequestDTO.class))).thenReturn(R.ok());
        lenient().doAnswer(invocation -> {
            AlarmRecord record = invocation.getArgument(0);
            record.setId(9001L);
            return 1;
        }).when(alarmRecordMapper).insert(any(AlarmRecord.class));
    }

    @Test
    void shouldCreateAlarmRecordAndDispatchNotificationWhenRuleMatches() {
        AlarmRule rule = buildRule(101L, "高温告警",
                """
                        {"mode":"STRUCTURED","version":3,"groups":[{"level":"WARNING","triggerMode":"ALL","conditions":[{"type":"THRESHOLD","metricKey":"temperature","aggregateType":"LATEST","operator":"GT","threshold":80}]}]}
                        """,
                """
                        {"version":1,"channels":["EMAIL"],"recipientGroupCodes":[],"recipientUsernames":["alice"]}
                        """);
        AlarmChannelOption channel = new AlarmChannelOption();
        channel.setId(11L);
        channel.setTenantId(0L);
        channel.setType("EMAIL");
        channel.setName("platform-email");
        AlarmRecipientUser user = new AlarmRecipientUser();
        user.setUserId(201L);
        user.setUsername("alice");
        user.setEmail("alice@example.com");

        when(alarmRuleMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(rule));
        when(alarmRecordMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);
        when(alarmRuntimeMapper.selectAvailableChannelsByTypes(anyLong(), anyList())).thenReturn(List.of(channel));
        when(alarmRuntimeMapper.selectActiveUsersByUsernames(anyLong(), anyList())).thenReturn(List.of(user));

        DeviceMessage message = buildPropertyMessage(88);

        alarmRuntimeService.process(message);

        ArgumentCaptor<AlarmRecord> recordCaptor = ArgumentCaptor.forClass(AlarmRecord.class);
        verify(alarmRecordMapper).insert(recordCaptor.capture());
        AlarmRecord inserted = recordCaptor.getValue();
        assertEquals(AlarmStatus.TRIGGERED, inserted.getStatus());
        assertEquals(AlarmLevel.WARNING, inserted.getLevel());
        assertEquals("高温告警", inserted.getTitle());
        assertTrue(inserted.getContent().contains("temperature=88"));

        ArgumentCaptor<NotificationRequestDTO> requestCaptor = ArgumentCaptor.forClass(NotificationRequestDTO.class);
        verify(notificationClient).send(requestCaptor.capture());
        NotificationRequestDTO request = requestCaptor.getValue();
        assertEquals(2001L, request.getTenantId());
        assertEquals(11L, request.getChannelId());
        assertEquals("ALARM_EMAIL", request.getTemplateCode());
        assertEquals("alice@example.com", request.getRecipient());
        assertEquals("高温告警", request.getVariables().get("rule_name"));
    }

    @Test
    void shouldCloseExistingAlarmRecordWhenConditionRecovers() {
        AlarmRule rule = buildRule(102L, "高温告警",
                """
                        {"mode":"STRUCTURED","version":3,"groups":[{"level":"WARNING","triggerMode":"ALL","conditions":[{"type":"THRESHOLD","metricKey":"temperature","aggregateType":"LATEST","operator":"GT","threshold":80}]}]}
                        """,
                null);
        AlarmRecord activeRecord = new AlarmRecord();
        activeRecord.setId(7001L);
        activeRecord.setTenantId(2001L);
        activeRecord.setAlarmRuleId(102L);
        activeRecord.setDeviceId(4001L);
        activeRecord.setLevel(AlarmLevel.WARNING);
        activeRecord.setStatus(AlarmStatus.TRIGGERED);

        when(alarmRuleMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(rule));
        when(alarmRecordMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(activeRecord);

        alarmRuntimeService.process(buildPropertyMessage(72));

        ArgumentCaptor<AlarmRecord> recordCaptor = ArgumentCaptor.forClass(AlarmRecord.class);
        verify(alarmRecordMapper).updateById(recordCaptor.capture());
        AlarmRecord updated = recordCaptor.getValue();
        assertEquals(AlarmStatus.CLOSED, updated.getStatus());
        assertTrue(updated.getProcessRemark().contains("自动关闭"));
        verify(alarmRecordMapper, never()).insert(any(AlarmRecord.class));
        verify(notificationClient, never()).send(any(NotificationRequestDTO.class));
    }

    @Test
    void shouldEscalateExistingAlarmToHigherLevel() {
        AlarmRule rule = buildRule(103L, "温控告警",
                """
                        {"mode":"STRUCTURED","version":3,"groups":[
                          {"level":"CRITICAL","triggerMode":"ALL","conditions":[{"type":"THRESHOLD","metricKey":"temperature","aggregateType":"LATEST","operator":"GTE","threshold":95}]},
                          {"level":"WARNING","triggerMode":"ALL","conditions":[{"type":"THRESHOLD","metricKey":"temperature","aggregateType":"LATEST","operator":"GTE","threshold":80}]}
                        ]}
                        """,
                """
                        {"version":1,"channels":["IN_APP"],"recipientGroupCodes":[],"recipientUsernames":["alice"]}
                        """);
        AlarmRecord activeRecord = new AlarmRecord();
        activeRecord.setId(7002L);
        activeRecord.setTenantId(2001L);
        activeRecord.setAlarmRuleId(103L);
        activeRecord.setDeviceId(4001L);
        activeRecord.setLevel(AlarmLevel.WARNING);
        activeRecord.setStatus(AlarmStatus.TRIGGERED);
        AlarmChannelOption channel = new AlarmChannelOption();
        channel.setId(21L);
        channel.setTenantId(0L);
        channel.setType("IN_APP");
        channel.setName("in-app");
        AlarmRecipientUser user = new AlarmRecipientUser();
        user.setUserId(201L);
        user.setUsername("alice");

        when(alarmRuleMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(rule));
        when(alarmRecordMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(activeRecord);
        when(alarmRuntimeMapper.selectAvailableChannelsByTypes(anyLong(), anyList())).thenReturn(List.of(channel));
        when(alarmRuntimeMapper.selectActiveUsersByUsernames(anyLong(), anyList())).thenReturn(List.of(user));

        alarmRuntimeService.process(buildPropertyMessage(98));

        ArgumentCaptor<AlarmRecord> updatedCaptor = ArgumentCaptor.forClass(AlarmRecord.class);
        verify(alarmRecordMapper).updateById(updatedCaptor.capture());
        assertEquals(AlarmStatus.CLOSED, updatedCaptor.getValue().getStatus());
        assertTrue(updatedCaptor.getValue().getProcessRemark().contains("更高级别告警"));

        ArgumentCaptor<AlarmRecord> insertedCaptor = ArgumentCaptor.forClass(AlarmRecord.class);
        verify(alarmRecordMapper).insert(insertedCaptor.capture());
        assertEquals(AlarmLevel.CRITICAL, insertedCaptor.getValue().getLevel());

        ArgumentCaptor<NotificationRequestDTO> notificationCaptor = ArgumentCaptor.forClass(NotificationRequestDTO.class);
        verify(notificationClient).send(notificationCaptor.capture());
        assertEquals("201", notificationCaptor.getValue().getRecipient());
        assertEquals("ALARM_IN_APP", notificationCaptor.getValue().getTemplateCode());
    }

    @Test
    void shouldEvaluateCompareConditionAgainstPreviousWindow() {
        AlarmRule rule = buildRule(104L, "趋势告警",
                """
                        {"mode":"STRUCTURED","version":3,"groups":[{"level":"INFO","triggerMode":"ALL","conditions":[{"type":"COMPARE","metricKey":"temperature","aggregateType":"AVG","threshold":20,"windowSize":1,"windowUnit":"HOURS","compareTarget":"PREVIOUS_PERIOD","changeMode":"PERCENT","changeDirection":"UP"}]}]}
                        """,
                null);
        AlarmMetricAggregate currentAggregate = new AlarmMetricAggregate();
        currentAggregate.setSampleCount(10L);
        currentAggregate.setAvgValue(120D);
        AlarmMetricAggregate previousAggregate = new AlarmMetricAggregate();
        previousAggregate.setSampleCount(10L);
        previousAggregate.setAvgValue(100D);

        when(alarmRuleMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(rule));
        when(alarmRecordMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);
        when(alarmRuntimeMapper.selectMetricAggregate(anyLong(), anyLong(), any(), any(), any()))
                .thenReturn(currentAggregate, previousAggregate);

        alarmRuntimeService.process(buildPropertyMessage(120));

        ArgumentCaptor<AlarmRecord> insertedCaptor = ArgumentCaptor.forClass(AlarmRecord.class);
        verify(alarmRecordMapper).insert(insertedCaptor.capture());
        assertEquals(AlarmLevel.INFO, insertedCaptor.getValue().getLevel());
        assertTrue(insertedCaptor.getValue().getContent().contains("变化%=20"));
    }

    @Test
    void shouldIgnoreNonPropertyMessagesAndKeepOpenAlarmUntouched() {
        DeviceMessage message = DeviceMessage.builder()
                .messageId("event-1")
                .tenantId(2001L)
                .productId(3001L)
                .deviceId(4001L)
                .deviceName("dev-001")
                .type(DeviceMessage.MessageType.EVENT_REPORT)
                .topic("/sys/pk-01/dev-001/thing/event/post")
                .payload(Map.of("code", "overheat"))
                .timestamp(System.currentTimeMillis())
                .build();

        alarmRuntimeService.process(message);

        verify(alarmRuleMapper, never()).selectList(any(LambdaQueryWrapper.class));
        verify(alarmRecordMapper, never()).updateById(any(AlarmRecord.class));
        verify(alarmRecordMapper, never()).insert(any(AlarmRecord.class));
    }

    private AlarmRule buildRule(Long id, String name, String conditionExpr, String notifyConfig) {
        AlarmRule rule = new AlarmRule();
        rule.setId(id);
        rule.setTenantId(2001L);
        rule.setName(name);
        rule.setConditionExpr(conditionExpr);
        rule.setNotifyConfig(notifyConfig);
        rule.setEnabled(true);
        return rule;
    }

    private DeviceMessage buildPropertyMessage(double temperature) {
        return DeviceMessage.builder()
                .messageId("msg-1")
                .tenantId(2001L)
                .productId(3001L)
                .deviceId(4001L)
                .deviceName("dev-001")
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .topic("/sys/pk-01/dev-001/thing/property/post")
                .payload(Map.of("temperature", temperature))
                .timestamp(System.currentTimeMillis())
                .build();
    }
}
