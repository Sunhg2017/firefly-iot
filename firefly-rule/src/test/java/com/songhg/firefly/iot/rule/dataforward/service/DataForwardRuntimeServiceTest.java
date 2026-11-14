package com.songhg.firefly.iot.rule.dataforward.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.enums.DataForwardTargetType;
import com.songhg.firefly.iot.common.enums.ForwardStatus;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.rule.dataforward.entity.DataForwardRule;
import com.songhg.firefly.iot.rule.dataforward.mapper.DataForwardRuleMapper;
import com.songhg.firefly.iot.rule.dataforward.support.ForwardTemplateRenderer;
import com.songhg.firefly.iot.rule.dataforward.target.DataForwardTargetExecutor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DataForwardRuntimeServiceTest {

    @Mock
    private DataForwardRuleMapper ruleMapper;

    @Mock
    private DataForwardTargetExecutor mqttExecutor;

    private DataForwardRuntimeService runtimeService;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        ForwardTemplateRenderer renderer = new ForwardTemplateRenderer(objectMapper);
        when(mqttExecutor.type()).thenReturn(DataForwardTargetType.MQTT);
        runtimeService = new DataForwardRuntimeService(ruleMapper, objectMapper, renderer, List.of(mqttExecutor));
    }

    @Test
    void forwardsMessageWhenSourceMatches() throws Exception {
        DataForwardRule rule = buildRule("PROPERTY_REPORT", null);
        when(ruleMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(rule));

        runtimeService.process(buildMessage(DeviceMessage.MessageType.PROPERTY_REPORT, "/sys/device/property/post", 60.0));

        verify(mqttExecutor).execute(eq(rule), any(DeviceMessage.class), anyMap());
        verify(ruleMapper).recordExecutionSuccess(eq(1L), any(LocalDateTime.class));
    }

    @Test
    void skipsWhenSourceDoesNotMatch() throws Exception {
        DataForwardRule rule = buildRule("EVENT_REPORT", null);
        when(ruleMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(rule));

        runtimeService.process(buildMessage(DeviceMessage.MessageType.PROPERTY_REPORT, "/sys/device/property/post", 60.0));

        verify(mqttExecutor, never()).execute(any(), any(), anyMap());
        verify(ruleMapper, never()).recordExecutionSuccess(any(), any());
    }

    @Test
    void skipsWhenConditionNotMet() throws Exception {
        DataForwardRule rule = buildRule("PROPERTY_REPORT", "payload.temperature > 50");
        when(ruleMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(rule));

        runtimeService.process(buildMessage(DeviceMessage.MessageType.PROPERTY_REPORT, "/sys/device/property/post", 10.0));

        verify(mqttExecutor, never()).execute(any(), any(), anyMap());
    }

    @Test
    void recordsFailureWhenExecutorThrows() throws Exception {
        DataForwardRule rule = buildRule("PROPERTY_REPORT", null);
        when(ruleMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(rule));
        doThrow(new RuntimeException("broker down")).when(mqttExecutor).execute(any(), any(), anyMap());

        runtimeService.process(buildMessage(DeviceMessage.MessageType.PROPERTY_REPORT, "/sys/device/property/post", 60.0));

        verify(ruleMapper).recordExecutionFailure(eq(1L), any(LocalDateTime.class));
        verify(ruleMapper, never()).recordExecutionSuccess(any(), any());
    }

    private DataForwardRule buildRule(String sourcePattern, String condition) {
        DataForwardRule rule = new DataForwardRule();
        rule.setId(1L);
        rule.setTenantId(100L);
        rule.setName("test-rule");
        rule.setSourcePattern(sourcePattern);
        rule.setMatchCondition(condition);
        rule.setTargetType(DataForwardTargetType.MQTT);
        rule.setTargetConfig("{\"broker\":\"tcp://localhost:1883\",\"topic\":\"t\"}");
        rule.setStatus(ForwardStatus.ENABLED);
        rule.setTriggerCount(0L);
        rule.setSuccessCount(0L);
        rule.setErrorCount(0L);
        return rule;
    }

    private DeviceMessage buildMessage(DeviceMessage.MessageType type, String topic, Double temperature) {
        return DeviceMessage.builder()
                .messageId("msg-1")
                .tenantId(100L)
                .productId(200L)
                .deviceId(300L)
                .deviceName("sensor-001")
                .type(type)
                .topic(topic)
                .payload(Map.of("temperature", temperature))
                .timestamp(System.currentTimeMillis())
                .build();
    }
}
