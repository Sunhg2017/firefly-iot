package com.songhg.firefly.iot.rule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.client.DeviceClient;
import com.songhg.firefly.iot.api.client.NotificationClient;
import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.api.dto.NotificationRequestDTO;
import com.songhg.firefly.iot.common.enums.RuleActionType;
import com.songhg.firefly.iot.common.enums.RuleEngineStatus;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.rule.entity.RuleAction;
import com.songhg.firefly.iot.rule.entity.RuleEngine;
import com.songhg.firefly.iot.rule.mapper.RuleActionMapper;
import com.songhg.firefly.iot.rule.mapper.RuleEngineMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RuleRuntimeServiceTest {

    @Mock
    private RuleEngineMapper ruleEngineMapper;

    @Mock
    private RuleActionMapper ruleActionMapper;

    @Mock
    private NotificationClient notificationClient;

    @Mock
    private DeviceClient deviceClient;

    @Mock
    private KafkaTemplate<String, String> kafkaTemplate;

    @Mock
    private HttpClient httpClient;

    @Mock
    private HttpResponse<String> httpResponse;

    private RuleRuntimeService ruleRuntimeService;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        ruleRuntimeService = new RuleRuntimeService(
                ruleEngineMapper,
                ruleActionMapper,
                notificationClient,
                deviceClient,
                kafkaTemplate,
                objectMapper,
                httpClient
        );
    }

    @Test
    void shouldConsumeRuleInputAndForwardKafkaAction() {
        RuleEngine rule = buildRule(101L, "High Temp Rule", null,
                "SELECT payload.temperature AS temp, deviceName FROM '/sys/*/thing/property/post' WHERE payload.temperature >= 80");
        RuleAction action = buildAction(101L, RuleActionType.KAFKA_FORWARD,
                """
                        {"topic":"runtime.alerts","key":"${deviceId}","payload":{"temp":"${temp}","deviceName":"${deviceName}"}}
                        """);
        mockRules(List.of(rule), List.of(action));

        DeviceMessage message = DeviceMessage.builder()
                .messageId("msg-1")
                .tenantId(2001L)
                .productId(3001L)
                .deviceId(4001L)
                .deviceName("dev-001")
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .topic("/sys/pk-01/dev-001/thing/property/post")
                .payload(Map.of("temperature", 88))
                .timestamp(System.currentTimeMillis())
                .build();

        ruleRuntimeService.process(message);

        verify(kafkaTemplate).send("runtime.alerts", "4001", "{\"temp\":\"88\",\"deviceName\":\"dev-001\"}");
        verify(ruleEngineMapper).recordExecutionSuccess(eq(101L), any(LocalDateTime.class));
        verify(ruleEngineMapper, never()).recordExecutionFailure(eq(101L), any(LocalDateTime.class));
    }

    @Test
    void shouldSkipProjectScopedRuleWhenDeviceProjectDoesNotMatch() {
        RuleEngine rule = buildRule(102L, "Project Scoped Rule", 9001L,
                "SELECT * FROM 'EVENT_REPORT' WHERE payload.code == 'overheat'");
        RuleAction action = buildAction(102L, RuleActionType.KAFKA_FORWARD,
                "{\"topic\":\"runtime.alerts\",\"payload\":{\"code\":\"${code}\"}}");
        mockRules(List.of(rule), List.of(action));

        DeviceBasicVO deviceBasic = new DeviceBasicVO();
        deviceBasic.setId(4002L);
        deviceBasic.setProjectId(9002L);
        when(deviceClient.getDeviceBasic(4002L)).thenReturn(R.ok(deviceBasic));

        DeviceMessage message = DeviceMessage.builder()
                .messageId("msg-2")
                .tenantId(2001L)
                .productId(3001L)
                .deviceId(4002L)
                .deviceName("dev-002")
                .type(DeviceMessage.MessageType.EVENT_REPORT)
                .topic("/sys/pk-01/dev-002/thing/event/post")
                .payload(Map.of("code", "overheat"))
                .timestamp(System.currentTimeMillis())
                .build();

        ruleRuntimeService.process(message);

        verify(deviceClient).getDeviceBasic(4002L);
        verify(kafkaTemplate, never()).send(any(String.class), any(String.class), any(String.class));
        verify(ruleEngineMapper, never()).recordExecutionSuccess(eq(102L), any(LocalDateTime.class));
        verify(ruleEngineMapper, never()).recordExecutionFailure(eq(102L), any(LocalDateTime.class));
    }

    @Test
    void shouldInvokeWebhookActionSuccessfully() throws Exception {
        RuleEngine rule = buildRule(103L, "Webhook Rule", null,
                "SELECT payload.temperature AS temp FROM 'PROPERTY_REPORT' WHERE payload.temperature > 10");
        RuleAction action = buildAction(103L, RuleActionType.WEBHOOK,
                """
                        {"url":"https://ops.example.com/hook","method":"POST","headers":{"X-Device":"${deviceName}"},"body":{"temp":"${temp}"}}
                        """);
        mockRules(List.of(rule), List.of(action));
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(httpResponse);
        when(httpResponse.statusCode()).thenReturn(200);

        DeviceMessage message = DeviceMessage.builder()
                .messageId("msg-3")
                .tenantId(2001L)
                .productId(3001L)
                .deviceId(4003L)
                .deviceName("dev-003")
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .topic("/sys/pk-01/dev-003/thing/property/post")
                .payload(Map.of("temperature", 26))
                .timestamp(System.currentTimeMillis())
                .build();

        ruleRuntimeService.process(message);

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        HttpRequest request = requestCaptor.getValue();
        assertEquals("https://ops.example.com/hook", request.uri().toString());
        assertEquals("POST", request.method());
        assertEquals("dev-003", request.headers().firstValue("X-Device").orElse(null));
        verify(ruleEngineMapper).recordExecutionSuccess(eq(103L), any(LocalDateTime.class));
        verify(ruleEngineMapper, never()).recordExecutionFailure(eq(103L), any(LocalDateTime.class));
    }

    @Test
    void shouldDispatchNotificationActionWithDefaultVariables() {
        RuleEngine rule = buildRule(104L, "Notify Rule", null,
                "SELECT payload.temperature AS temp FROM 'PROPERTY_REPORT' WHERE payload.temperature >= 80");
        RuleAction action = buildAction(104L, RuleActionType.EMAIL,
                """
                        {"channelId":11,"templateCode":"device_alert","recipient":"ops@example.com","variables":{"temp":"${temp}"}}
                        """);
        mockRules(List.of(rule), List.of(action));
        when(notificationClient.send(any(NotificationRequestDTO.class))).thenReturn(R.ok());

        DeviceMessage message = DeviceMessage.builder()
                .messageId("msg-4")
                .tenantId(2001L)
                .productId(3001L)
                .deviceId(4004L)
                .deviceName("dev-004")
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .topic("/sys/pk-01/dev-004/thing/property/post")
                .payload(Map.of("temperature", 82))
                .timestamp(System.currentTimeMillis())
                .build();

        ruleRuntimeService.process(message);

        ArgumentCaptor<NotificationRequestDTO> requestCaptor = ArgumentCaptor.forClass(NotificationRequestDTO.class);
        verify(notificationClient).send(requestCaptor.capture());
        NotificationRequestDTO request = requestCaptor.getValue();
        assertEquals(2001L, request.getTenantId());
        assertEquals(11L, request.getChannelId());
        assertEquals("device_alert", request.getTemplateCode());
        assertEquals("ops@example.com", request.getRecipient());
        assertEquals("82", request.getVariables().get("temp"));
        assertEquals("EMAIL", request.getVariables().get("actionType"));
        assertEquals("Notify Rule", request.getVariables().get("ruleName"));
        verify(ruleEngineMapper).recordExecutionSuccess(eq(104L), any(LocalDateTime.class));
    }

    @Test
    void shouldSendDeviceCommandActionToDownstreamTopic() throws Exception {
        RuleEngine rule = buildRule(105L, "Command Rule", null,
                "SELECT payload.temperature AS temp FROM 'PROPERTY_REPORT' WHERE payload.temperature >= 80");
        RuleAction action = buildAction(105L, RuleActionType.DEVICE_COMMAND,
                """
                        {"commandType":"PROPERTY_SET","payload":{"targetTemp":"${temp}"}}
                        """);
        mockRules(List.of(rule), List.of(action));

        DeviceMessage message = DeviceMessage.builder()
                .messageId("msg-5")
                .tenantId(2001L)
                .productId(3001L)
                .deviceId(4005L)
                .deviceName("dev-005")
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .topic("/sys/pk-01/dev-005/thing/property/post")
                .payload(Map.of("temperature", 90))
                .timestamp(System.currentTimeMillis())
                .build();

        ruleRuntimeService.process(message);

        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(eq(KafkaTopics.DEVICE_MESSAGE_DOWN), eq("4005"), payloadCaptor.capture());
        DeviceMessage command = objectMapper.readValue(payloadCaptor.getValue(), DeviceMessage.class);
        assertEquals(DeviceMessage.MessageType.PROPERTY_SET, command.getType());
        assertEquals(4005L, command.getDeviceId());
        assertEquals("90", String.valueOf(command.getPayload().get("targetTemp")));
        assertNotNull(command.getTimestamp());
        verify(ruleEngineMapper).recordExecutionSuccess(eq(105L), any(LocalDateTime.class));
    }

    @Test
    void shouldRecordFailureWhenWebhookInvocationFails() throws Exception {
        RuleEngine rule = buildRule(106L, "Broken Webhook Rule", null,
                "SELECT * FROM 'PROPERTY_REPORT' WHERE payload.temperature > 10");
        RuleAction action = buildAction(106L, RuleActionType.WEBHOOK,
                "{\"url\":\"https://ops.example.com/hook\",\"method\":\"POST\"}");
        mockRules(List.of(rule), List.of(action));
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new IllegalStateException("network down"));

        DeviceMessage message = DeviceMessage.builder()
                .messageId("msg-6")
                .tenantId(2001L)
                .productId(3001L)
                .deviceId(4006L)
                .deviceName("dev-006")
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .topic("/sys/pk-01/dev-006/thing/property/post")
                .payload(Map.of("temperature", 26))
                .timestamp(System.currentTimeMillis())
                .build();

        ruleRuntimeService.process(message);

        verify(ruleEngineMapper).recordExecutionFailure(eq(106L), any(LocalDateTime.class));
        verify(ruleEngineMapper, never()).recordExecutionSuccess(eq(106L), any(LocalDateTime.class));
    }

    private void mockRules(List<RuleEngine> rules, List<RuleAction> actions) {
        when(ruleEngineMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(rules);
        when(ruleActionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(actions);
    }

    private RuleEngine buildRule(Long id, String name, Long projectId, String sqlExpr) {
        RuleEngine rule = new RuleEngine();
        rule.setId(id);
        rule.setTenantId(2001L);
        rule.setProjectId(projectId);
        rule.setName(name);
        rule.setSqlExpr(sqlExpr);
        rule.setStatus(RuleEngineStatus.ENABLED);
        return rule;
    }

    private RuleAction buildAction(Long ruleId, RuleActionType actionType, String actionConfig) {
        RuleAction action = new RuleAction();
        action.setRuleId(ruleId);
        action.setActionType(actionType);
        action.setActionConfig(actionConfig);
        action.setEnabled(true);
        action.setSortOrder(0);
        return action;
    }
}
