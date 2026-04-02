package com.songhg.firefly.iot.support.notification.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.support.notification.entity.MessageTemplate;
import com.songhg.firefly.iot.support.notification.entity.NotificationChannel;
import com.songhg.firefly.iot.support.notification.entity.NotificationRecord;
import com.songhg.firefly.iot.support.notification.mapper.NotificationChannelMapper;
import com.songhg.firefly.iot.support.notification.mapper.NotificationRecordMapper;
import com.songhg.firefly.iot.support.service.InAppMessageService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NotificationSenderTest {

    @Mock
    private NotificationChannelMapper channelMapper;

    @Mock
    private NotificationRecordMapper recordMapper;

    @Mock
    private MessageTemplateService templateService;

    @Mock
    private InAppMessageService inAppMessageService;

    @Test
    void shouldUsePlatformTemplateFallbackWhenSendingForTenant() {
        NotificationChannel channel = new NotificationChannel();
        channel.setId(11L);
        channel.setTenantId(0L);
        channel.setType("IN_APP");
        channel.setConfig("{}");
        channel.setEnabled(true);

        MessageTemplate template = new MessageTemplate();
        template.setCode("ALARM_IN_APP");
        template.setEnabled(true);
        template.setSubject("告警");
        template.setContent("设备 ${device_name} 告警");

        when(channelMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(channel);
        when(templateService.getEntityByCodeWithPlatformFallback(2001L, "ALARM_IN_APP")).thenReturn(template);
        when(templateService.render("告警", Map.of("device_name", "dev-001"))).thenReturn("告警");
        when(templateService.render("设备 ${device_name} 告警", Map.of("device_name", "dev-001")))
                .thenReturn("设备 dev-001 告警");

        NotificationSender sender = new NotificationSender(
                channelMapper,
                recordMapper,
                templateService,
                inAppMessageService,
                new ObjectMapper()
        );

        sender.sendForTenant(2001L, null, 11L, "ALARM_IN_APP", "201", Map.of("device_name", "dev-001"));

        verify(templateService).getEntityByCodeWithPlatformFallback(2001L, "ALARM_IN_APP");
        verify(inAppMessageService).sendBatch(
                2001L,
                null,
                List.of(201L),
                "告警",
                "设备 dev-001 告警",
                "SYSTEM",
                "INFO",
                "NOTIFICATION_CENTER",
                "ALARM_IN_APP"
        );
        verify(recordMapper).insert(any(NotificationRecord.class));
    }
}
