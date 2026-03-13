package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import org.junit.jupiter.api.Test;

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
    private final DeviceMessageProducer messageProducer = mock(DeviceMessageProducer.class);
    private final MessageRouterService routerService = new MessageRouterService(shadowService, deviceDataService, messageProducer);

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
}
