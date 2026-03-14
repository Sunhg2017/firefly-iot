package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.common.enums.EventLevel;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class MessageRouterServiceTest {

    private final DeviceShadowService shadowService = mock(DeviceShadowService.class);
    private final DeviceDataService deviceDataService = mock(DeviceDataService.class);
    private final DeviceService deviceService = mock(DeviceService.class);
    private final DeviceMessageProducer messageProducer = mock(DeviceMessageProducer.class);
    private final MessageRouterService routerService =
            new MessageRouterService(shadowService, deviceDataService, deviceService, messageProducer);

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
        verify(messageProducer).publishToTopic(
                eq(KafkaTopics.RULE_ENGINE_INPUT),
                argThat(ruleMessage -> "/sys/pk/dev-001/thing/property/post".equals(ruleMessage.getTopic()))
        );
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
