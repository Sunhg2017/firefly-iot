package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.common.enums.EventLevel;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import com.songhg.firefly.iot.common.message.PlatformEventPublisher;
import com.songhg.firefly.iot.device.mapper.RemoteConfigAssignmentMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

class MessageRouterServiceTest {

    private final DeviceShadowService shadowService = mock(DeviceShadowService.class);
    private final DeviceDataService deviceDataService = mock(DeviceDataService.class);
    private final DeviceService deviceService = mock(DeviceService.class);
    private final DeviceLocationService deviceLocationService = mock(DeviceLocationService.class);
    private final DeviceMessageProducer messageProducer = mock(DeviceMessageProducer.class);
    private final PlatformEventPublisher platformEventPublisher = mock(PlatformEventPublisher.class);
    private final RemoteConfigAssignmentMapper remoteConfigAssignmentMapper = mock(RemoteConfigAssignmentMapper.class);
    private final OtaProgressService otaProgressService = mock(OtaProgressService.class);
    private final MessageRouterService routerService =
            new MessageRouterService(shadowService, deviceDataService, deviceService, deviceLocationService, messageProducer,
                    platformEventPublisher, remoteConfigAssignmentMapper, otaProgressService);

    @BeforeEach
    void setUpRuleForwarding() {
        when(messageProducer.publishToTopic(any(), any()))
                .thenReturn(CompletableFuture.completedFuture(null));
    }

    @Test
    void shouldForwardEventReportToRuleEngineTopic() {
        DeviceMessage message = DeviceMessage.builder()
                .messageId("msg-1")
                .tenantId(1L)
                .productId(2L)
                .deviceId(3L)
                .deviceName("dev-001")
                .type(DeviceMessage.MessageType.EVENT_REPORT)
                .topic("/sys/pk/dev-001/thing/event/post")
                .payload(Map.of("event", "overheat"))
                .timestamp(123456789L)
                .build();

        routerService.routeUpstream(message);

        verify(deviceDataService).writeEventFromMessage(message);
        verify(messageProducer).publishToTopic(
                eq(KafkaTopics.RULE_ENGINE_INPUT),
                argThat(ruleMessage -> "/sys/pk/dev-001/thing/event/post".equals(ruleMessage.getTopic()))
        );
        verify(messageProducer, never()).publishUpstream(any(DeviceMessage.class));
        verify(shadowService, never()).updateReported(any(), any());
    }

    @Test
    void shouldPersistTelemetryAndUpdateShadowForPropertyReport() {
        DeviceMessage message = DeviceMessage.builder()
                .messageId("msg-2")
                .tenantId(1L)
                .productId(2L)
                .deviceId(3L)
                .deviceName("dev-001")
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .topic("/sys/pk/dev-001/thing/property/post")
                .payload(Map.of("temperature", 26.5, "switch", true))
                .timestamp(123456789L)
                .build();

        routerService.routeUpstream(message);

        verify(deviceDataService).writeTelemetryFromMessage(message);
        verify(shadowService).updateReported(eq(3L), eq(message.getPayload()));
        verify(deviceLocationService).syncLocationFromPropertyReport(message);
        verify(messageProducer).publishToTopic(
                eq(KafkaTopics.RULE_ENGINE_INPUT),
                argThat(ruleMessage -> "/sys/pk/dev-001/thing/property/post".equals(ruleMessage.getTopic()))
        );
    }

    @Test
    void shouldUnwrapPropertyEnvelopeBeforePersistingTelemetryAndShadow() {
        Map<String, Object> params = Map.of("temperature", 26.5, "switch", true);
        DeviceMessage message = DeviceMessage.builder()
                .messageId("msg-2b")
                .tenantId(1L)
                .productId(2L)
                .deviceId(3L)
                .deviceName("dev-001")
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .topic("/sys/pk/dev-001/thing/property/post")
                .payload(Map.of("id", "1", "params", params))
                .timestamp(123456789L)
                .build();

        routerService.routeUpstream(message);

        verify(deviceDataService).writeTelemetryFromMessage(argThat(actual ->
                actual != null && params.equals(actual.getPayload())
        ));
        verify(shadowService).updateReported(eq(3L), eq(params));
        verify(deviceLocationService).syncLocationFromPropertyReport(argThat(actual ->
                actual != null && params.equals(actual.getPayload())
        ));
        verify(messageProducer).publishToTopic(
                eq(KafkaTopics.RULE_ENGINE_INPUT),
                argThat(ruleMessage -> ruleMessage != null && params.equals(ruleMessage.getPayload()))
        );
    }

    @Test
    void shouldPropagateErrorWhenRuleForwardSendFails() {
        when(messageProducer.publishToTopic(any(), any()))
                .thenReturn(CompletableFuture.failedFuture(new IllegalStateException("kafka down")));
        DeviceMessage message = DeviceMessage.builder()
                .messageId("msg-9")
                .tenantId(1L)
                .productId(2L)
                .deviceId(3L)
                .deviceName("dev-001")
                .type(DeviceMessage.MessageType.EVENT_REPORT)
                .topic("/sys/pk/dev-001/thing/event/post")
                .payload(Map.of("event", "overheat"))
                .timestamp(123456789L)
                .build();

        assertThrows(IllegalStateException.class, () -> routerService.routeUpstream(message));
    }

    @Test
    void shouldPropagateErrorWhenTelemetryPersistenceFails() {
        DeviceMessage message = DeviceMessage.builder()
                .messageId("msg-2c")
                .tenantId(1L)
                .productId(2L)
                .deviceId(3L)
                .deviceName("dev-001")
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .topic("/sys/pk/dev-001/thing/property/post")
                .payload(Map.of("temperature", 26.5))
                .timestamp(123456789L)
                .build();
        doThrow(new RuntimeException("tsdb down")).when(deviceDataService).writeTelemetryFromMessage(any(DeviceMessage.class));

        // 遥测持久化属于核心步骤：失败必须上抛给消费框架进入重试/死信，而不是继续转发。
        assertThrows(RuntimeException.class, () -> routerService.routeUpstream(message));

        verify(shadowService, never()).updateReported(any(), any());
        verify(messageProducer, never()).publishToTopic(any(), any());
    }

    @Test
    void shouldNotSyncLocationWhenPropertyPayloadIsEmpty() {
        DeviceMessage message = DeviceMessage.builder()
                .messageId("msg-empty")
                .tenantId(1L)
                .productId(2L)
                .deviceId(3L)
                .deviceName("dev-001")
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .topic("/sys/pk/dev-001/thing/property/post")
                .payload(Map.of())
                .timestamp(123456789L)
                .build();

        routerService.routeUpstream(message);

        verify(deviceLocationService, never()).syncLocationFromPropertyReport(any(DeviceMessage.class));
    }

    @Test
    void shouldUpdateConnectionStateAndPersistLifecycleEvent() {
        DeviceMessage message = DeviceMessage.builder()
                .messageId("msg-3")
                .tenantId(1L)
                .productId(2L)
                .deviceId(3L)
                .deviceName("dev-001")
                .type(DeviceMessage.MessageType.DEVICE_ONLINE)
                .topic("/sys/pk/dev-001/lifecycle/online")
                .payload(Map.of("status", "connected"))
                .timestamp(123456789L)
                .build();

        routerService.routeUpstream(message);

        verify(deviceService).updateRuntimeConnectionState(eq(1L), eq(3L), eq(OnlineStatus.ONLINE), any(LocalDateTime.class));
        verify(deviceDataService).writeOperationalEventFromMessage(
                eq(message), eq("DEVICE_ONLINE"), eq("Device Online"), eq(EventLevel.INFO)
        );
        verify(messageProducer).publishToTopic(
                eq(KafkaTopics.RULE_ENGINE_INPUT),
                argThat(ruleMessage -> "/sys/pk/dev-001/lifecycle/online".equals(ruleMessage.getTopic()))
        );
    }

    @Test
    void shouldReconcileShadowOnPropertySetReply() {
        DeviceMessage message = DeviceMessage.builder()
                .messageId("msg-4")
                .tenantId(1L)
                .productId(2L)
                .deviceId(3L)
                .deviceName("dev-001")
                .type(DeviceMessage.MessageType.PROPERTY_SET_REPLY)
                .topic("/sys/pk/dev-001/thing/property/set/reply")
                .payload(Map.of("targetTemp", 23))
                .timestamp(123456789L)
                .build();

        routerService.routeUpstream(message);

        verify(shadowService).applyPropertySetReply(3L, Map.of("targetTemp", 23));
        verify(deviceDataService).writeOperationalEventFromMessage(
                eq(message), eq("PROPERTY_SET_REPLY"), eq("Property Set Reply"), eq(EventLevel.INFO)
        );
        verify(messageProducer).publishToTopic(
                eq(KafkaTopics.RULE_ENGINE_INPUT),
                argThat(ruleMessage -> "/sys/pk/dev-001/thing/property/set/reply".equals(ruleMessage.getTopic()))
        );
    }

    @Test
    void shouldPersistOperationalEventForOtaProgress() {
        DeviceMessage message = DeviceMessage.builder()
                .messageId("msg-5")
                .tenantId(1L)
                .productId(2L)
                .deviceId(3L)
                .deviceName("dev-001")
                .type(DeviceMessage.MessageType.OTA_PROGRESS)
                .topic("/sys/pk/dev-001/ota/progress")
                .payload(Map.of("status", "DOWNLOADING", "percent", 30))
                .timestamp(123456789L)
                .build();

        routerService.routeUpstream(message);

        verify(deviceDataService).writeOperationalEventFromMessage(
                eq(message), eq("OTA_PROGRESS"), eq("OTA Progress"), eq(EventLevel.INFO)
        );
        verify(messageProducer).publishToTopic(
                eq(KafkaTopics.RULE_ENGINE_INPUT),
                argThat(ruleMessage -> "/sys/pk/dev-001/ota/progress".equals(ruleMessage.getTopic()))
        );
    }
}
