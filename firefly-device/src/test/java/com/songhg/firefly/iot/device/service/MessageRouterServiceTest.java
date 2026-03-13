package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class MessageRouterServiceTest {

    private final DeviceShadowService shadowService = mock(DeviceShadowService.class);
    private final DeviceMessageProducer messageProducer = mock(DeviceMessageProducer.class);
    private final MessageRouterService routerService = new MessageRouterService(shadowService, messageProducer);

    @Test
    void shouldForwardEventReportToRuleEngineTopic() {
        DeviceMessage message = DeviceMessage.builder()
                .messageId("msg-1")
                .tenantId(1L)
                .productId(2L)
                .deviceId(3L)
                .deviceName("dev-001")
                .type(DeviceMessage.MessageType.EVENT_REPORT)
                .payload(Map.of("event", "overheat"))
                .timestamp(123456789L)
                .build();

        routerService.routeUpstream(message);

        verify(messageProducer).publishToTopic(eq(KafkaTopics.RULE_ENGINE_INPUT), any(DeviceMessage.class));
        verify(messageProducer, never()).publishUpstream(any(DeviceMessage.class));
        verify(shadowService, never()).updateReported(any(), any());
    }
}
