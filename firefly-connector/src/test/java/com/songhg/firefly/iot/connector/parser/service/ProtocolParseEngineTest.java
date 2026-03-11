package com.songhg.firefly.iot.connector.parser.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.parser.executor.ScriptParserExecutor;
import com.songhg.firefly.iot.connector.parser.model.ParseContext;
import com.songhg.firefly.iot.connector.parser.model.ParseExecutionResult;
import com.songhg.firefly.iot.connector.parser.model.ParsedDeviceIdentity;
import com.songhg.firefly.iot.connector.parser.model.ParsedMessage;
import com.songhg.firefly.iot.connector.parser.model.ProtocolParseOutcome;
import com.songhg.firefly.iot.connector.parser.model.ResolvedDeviceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProtocolParseEngineTest {

    @Mock
    private PublishedProtocolParserService publishedProtocolParserService;

    @Mock
    private DeviceIdentityResolveService deviceIdentityResolveService;

    @Mock
    private ScriptParserExecutor scriptParserExecutor;

    @Mock
    private ProtocolParserPluginRegistry protocolParserPluginRegistry;

    @Mock
    private ProtocolParserMetricsService protocolParserMetricsService;

    @Mock
    private ProtocolParserReleaseMatcher protocolParserReleaseMatcher;

    private ProtocolParserMatcher protocolParserMatcher;
    private ProtocolParseEngine protocolParseEngine;

    @BeforeEach
    void setUp() {
        protocolParserMatcher = new ProtocolParserMatcher(new ObjectMapper());
        protocolParseEngine = new ProtocolParseEngine(
                new ObjectMapper(),
                publishedProtocolParserService,
                deviceIdentityResolveService,
                scriptParserExecutor,
                protocolParserMatcher,
                protocolParserPluginRegistry,
                protocolParserMetricsService,
                protocolParserReleaseMatcher
        );
    }

    @Test
    void parseShouldNormalizeMatchedMessages() {
        ProtocolParserPublishedDTO definition = new ProtocolParserPublishedDTO();
        definition.setDefinitionId(21L);
        definition.setProtocol("MQTT");
        definition.setTransport("MQTT");
        definition.setDirection("UPLINK");
        definition.setParserMode("SCRIPT");
        definition.setMatchRuleJson("{\"topicPrefix\":\"/up/\"}");
        definition.setParserConfigJson("{\"threshold\":10}");

        ParsedDeviceIdentity identity = new ParsedDeviceIdentity();
        identity.setMode("BY_DEVICE_NAME");
        identity.setDeviceName("dev-01");
        identity.setProductKey("pk-demo");

        ParsedMessage parsedMessage = new ParsedMessage();
        parsedMessage.setMessageId("m-1");
        parsedMessage.setType("property_report");
        parsedMessage.setPayload(Map.of("temperature", 26));

        ParseExecutionResult executionResult = new ParseExecutionResult();
        executionResult.setIdentity(identity);
        executionResult.setMessages(List.of(parsedMessage));

        ResolvedDeviceContext resolved = ResolvedDeviceContext.builder()
                .tenantId(501L)
                .productId(1001L)
                .deviceId(2002L)
                .deviceName("device-a")
                .productKey("pk-demo")
                .build();

        ParseContext parseContext = ParseContext.builder()
                .protocol("mqtt")
                .transport("mqtt")
                .topic("/up/telemetry")
                .payload(new byte[] {1, 2, 3})
                .payloadText("payload")
                .payloadHex("010203")
                .headers(Map.of("tenant", "alpha"))
                .sessionId("session-1")
                .remoteAddress("127.0.0.1")
                .productId(1001L)
                .productKey("pk-demo")
                .build();

        when(publishedProtocolParserService.getPublishedDefinitions(1001L)).thenReturn(List.of(definition));
        when(scriptParserExecutor.execute(eq(definition), any(ParseContext.class))).thenReturn(executionResult);
        when(deviceIdentityResolveService.resolve(any(ParseContext.class), eq(null), eq(identity))).thenReturn(resolved);
        when(protocolParserReleaseMatcher.matches(definition, resolved)).thenReturn(true);

        ProtocolParseOutcome outcome = protocolParseEngine.parse(parseContext, null);

        assertThat(outcome.isHandled()).isTrue();
        assertThat(outcome.getMessages()).hasSize(1);
        DeviceMessage message = outcome.getMessages().get(0);
        assertThat(message.getMessageId()).isEqualTo("m-1");
        assertThat(message.getTenantId()).isEqualTo(501L);
        assertThat(message.getProductId()).isEqualTo(1001L);
        assertThat(message.getDeviceId()).isEqualTo(2002L);
        assertThat(message.getDeviceName()).isEqualTo("device-a");
        assertThat(message.getTopic()).isEqualTo("/up/telemetry");
        assertThat(message.getType()).isEqualTo(DeviceMessage.MessageType.PROPERTY_REPORT);
        assertThat(message.getPayload()).containsEntry("temperature", 26);

        ArgumentCaptor<ParseContext> contextCaptor = ArgumentCaptor.forClass(ParseContext.class);
        verify(scriptParserExecutor).execute(eq(definition), contextCaptor.capture());
        ParseContext effectiveContext = contextCaptor.getValue();
        assertThat(effectiveContext.getProductId()).isEqualTo(1001L);
        assertThat(effectiveContext.getProductKey()).isEqualTo("pk-demo");
        assertThat(effectiveContext.getConfig()).containsEntry("threshold", 10);
        assertThat(effectiveContext.getConfig()).containsEntry("productId", 1001L);
    }

    @Test
    void parseShouldReturnNotHandledWhenProductContextIsMissing() {
        ParseContext parseContext = ParseContext.builder()
                .protocol("MQTT")
                .transport("MQTT")
                .topic("/up/telemetry")
                .payload(new byte[] {1})
                .payloadText("x")
                .payloadHex("01")
                .headers(Map.of())
                .build();

        ProtocolParseOutcome outcome = protocolParseEngine.parse(parseContext, null);

        assertThat(outcome.isHandled()).isFalse();
        assertThat(outcome.getMessages()).isEmpty();
        verifyNoInteractions(publishedProtocolParserService, deviceIdentityResolveService, scriptParserExecutor);
    }

    @Test
    void parseShouldFallbackRawDataWhenPolicyIsRawData() {
        ProtocolParserPublishedDTO definition = baseDefinition(31L);
        definition.setErrorPolicy("RAW_DATA");

        ParseContext parseContext = baseParseContext();
        when(publishedProtocolParserService.getPublishedDefinitions(1001L)).thenReturn(List.of(definition));
        when(scriptParserExecutor.execute(eq(definition), any(ParseContext.class)))
                .thenThrow(new IllegalStateException("broken parser"));

        ProtocolParseOutcome outcome = protocolParseEngine.parse(parseContext, null);

        assertThat(outcome.isHandled()).isFalse();
        assertThat(outcome.getMessages()).isEmpty();
    }

    @Test
    void parseShouldContinueAfterFirstFailureAndUseNextCandidate() {
        ProtocolParserPublishedDTO failedDefinition = baseDefinition(41L);
        failedDefinition.setErrorPolicy("ERROR");
        ProtocolParserPublishedDTO successDefinition = baseDefinition(42L);

        ParsedDeviceIdentity identity = new ParsedDeviceIdentity();
        identity.setMode("BY_DEVICE_NAME");
        identity.setDeviceName("device-a");
        identity.setProductKey("pk-demo");

        ParsedMessage parsedMessage = new ParsedMessage();
        parsedMessage.setMessageId("ok-1");
        parsedMessage.setType("property_report");
        parsedMessage.setPayload(Map.of("code", "A1"));

        ParseExecutionResult successResult = new ParseExecutionResult();
        successResult.setIdentity(identity);
        successResult.setMessages(List.of(parsedMessage));

        ResolvedDeviceContext resolved = ResolvedDeviceContext.builder()
                .tenantId(501L)
                .productId(1001L)
                .deviceId(2002L)
                .deviceName("device-a")
                .productKey("pk-demo")
                .build();

        ParseContext parseContext = baseParseContext();
        when(publishedProtocolParserService.getPublishedDefinitions(1001L))
                .thenReturn(List.of(failedDefinition, successDefinition));
        when(scriptParserExecutor.execute(eq(failedDefinition), any(ParseContext.class)))
                .thenThrow(new IllegalStateException("first parser failed"));
        when(scriptParserExecutor.execute(eq(successDefinition), any(ParseContext.class)))
                .thenReturn(successResult);
        when(deviceIdentityResolveService.resolve(any(ParseContext.class), eq(null), eq(identity))).thenReturn(resolved);
        when(protocolParserReleaseMatcher.matches(successDefinition, resolved)).thenReturn(true);

        ProtocolParseOutcome outcome = protocolParseEngine.parse(parseContext, null);

        assertThat(outcome.isHandled()).isTrue();
        assertThat(outcome.getMessages()).hasSize(1);
        assertThat(outcome.getMessages().get(0).getMessageId()).isEqualTo("ok-1");
        assertThat(outcome.getMessages().get(0).getType()).isEqualTo(DeviceMessage.MessageType.PROPERTY_REPORT);
    }

    @Test
    void parseShouldReturnHandledEmptyWhenPolicyIsDrop() {
        ProtocolParserPublishedDTO definition = baseDefinition(51L);
        definition.setErrorPolicy("DROP");

        ParsedDeviceIdentity identity = new ParsedDeviceIdentity();
        identity.setMode("BY_DEVICE_NAME");
        identity.setDeviceName("missing-device");

        ParseExecutionResult executionResult = new ParseExecutionResult();
        executionResult.setIdentity(identity);
        executionResult.setMessages(List.of());

        ParseContext parseContext = baseParseContext();
        when(publishedProtocolParserService.getPublishedDefinitions(1001L)).thenReturn(List.of(definition));
        when(scriptParserExecutor.execute(eq(definition), any(ParseContext.class))).thenReturn(executionResult);
        when(deviceIdentityResolveService.resolve(any(ParseContext.class), eq(null), eq(identity))).thenReturn(null);

        ProtocolParseOutcome outcome = protocolParseEngine.parse(parseContext, null);

        assertThat(outcome.isHandled()).isTrue();
        assertThat(outcome.getMessages()).isEmpty();
    }

    private ProtocolParserPublishedDTO baseDefinition(Long definitionId) {
        ProtocolParserPublishedDTO definition = new ProtocolParserPublishedDTO();
        definition.setDefinitionId(definitionId);
        definition.setProtocol("MQTT");
        definition.setTransport("MQTT");
        definition.setDirection("UPLINK");
        definition.setParserMode("SCRIPT");
        definition.setMatchRuleJson("{}");
        definition.setParserConfigJson("{}");
        definition.setErrorPolicy("ERROR");
        return definition;
    }

    private ParseContext baseParseContext() {
        return ParseContext.builder()
                .protocol("mqtt")
                .transport("mqtt")
                .topic("/up/telemetry")
                .payload(new byte[] {1, 2, 3})
                .payloadText("payload")
                .payloadHex("010203")
                .headers(Map.of())
                .sessionId("session-1")
                .remoteAddress("127.0.0.1")
                .productId(1001L)
                .productKey("pk-demo")
                .build();
    }
}
