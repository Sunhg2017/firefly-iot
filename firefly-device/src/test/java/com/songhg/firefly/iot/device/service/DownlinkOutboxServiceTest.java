package com.songhg.firefly.iot.device.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.device.entity.DownlinkOutbox;
import com.songhg.firefly.iot.device.mapper.DownlinkOutboxMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DownlinkOutboxServiceTest {

    @Mock
    private DownlinkOutboxMapper downlinkOutboxMapper;
    @Mock
    private KafkaTemplate<String, String> kafkaTemplate;

    private DownlinkOutboxService service;

    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        assistant.setCurrentNamespace("DownlinkOutboxServiceTest");
        TableInfoHelper.initTableInfo(assistant, DownlinkOutbox.class);
    }

    @BeforeEach
    void setUp() {
        service = new DownlinkOutboxService(downlinkOutboxMapper, new ObjectMapper(), kafkaTemplate);
        setField(service, "maxAttempts", 3);
        setField(service, "retryBaseSeconds", 30L);
        setField(service, "retryBatchSize", 100);
    }

    @Test
    void recordPersistsPendingOutbox() throws Exception {
        DeviceMessage message = DeviceMessage.builder()
                .messageId("m1")
                .tenantId(7L)
                .deviceId(42L)
                .type(DeviceMessage.MessageType.PROPERTY_SET)
                .build();

        service.record(message);

        ArgumentCaptor<DownlinkOutbox> captor = ArgumentCaptor.forClass(DownlinkOutbox.class);
        verify(downlinkOutboxMapper).insertIgnore(captor.capture());
        DownlinkOutbox outbox = captor.getValue();
        assertThat(outbox.getDeviceId()).isEqualTo(42L);
        assertThat(outbox.getMessageId()).isEqualTo("m1");
        assertThat(outbox.getStatus()).isEqualTo("PENDING");
        assertThat(outbox.getPayload()).contains("m1");
    }

    @Test
    void markDeliveredUpdatesStatus() {
        service.markDelivered(42L, "m1");

        verify(downlinkOutboxMapper).update(any(), any());
    }

    @Test
    void retryDueRepublishesAndBumpsAttempts() {
        DownlinkOutbox outbox = new DownlinkOutbox();
        outbox.setId(1L);
        outbox.setTenantId(7L);
        outbox.setDeviceId(42L);
        outbox.setMessageId("m1");
        outbox.setPayload("{\"messageId\":\"m1\"}");
        outbox.setStatus("PENDING");
        outbox.setAttempts(0);
        outbox.setMaxAttempts(3);
        outbox.setNextRetryAt(LocalDateTime.now().minusSeconds(10));
        when(downlinkOutboxMapper.selectList(any())).thenReturn(List.of(outbox));

        int processed = service.retryDue();

        assertThat(processed).isEqualTo(1);
        verify(kafkaTemplate).send(any(), any(), any());
        verify(downlinkOutboxMapper).update(any(), any());
    }

    private static void setField(Object target, String name, Object value) {
        try {
            var field = target.getClass().getDeclaredField(name);
            field.setAccessible(true);
            field.set(target, value);
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }
}
