package com.songhg.firefly.iot.common.message;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * 平台事件发布器：把平台事件（设备创建/上下线/告警触发/OTA 进度）发布到 {@code platform.event}，
 * 供「数据流转中心-事件订阅」消费。发布为尽力语义，失败仅记录日志，不阻塞业务主流程。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PlatformEventPublisher {

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    public void publish(PlatformEvent event) {
        if (event == null || event.getEventType() == null) {
            return;
        }
        try {
            if (event.getEventId() == null) {
                event.setEventId(UUID.randomUUID().toString());
            }
            if (event.getTimestamp() == 0) {
                event.setTimestamp(System.currentTimeMillis());
            }
            String key = event.getDeviceId() != null
                    ? String.valueOf(event.getDeviceId())
                    : String.valueOf(event.getTenantId());
            String json = objectMapper.writeValueAsString(event);
            kafkaTemplate.send(KafkaTopics.PLATFORM_EVENT, key, json);
        } catch (Exception ex) {
            log.error("Failed to publish platform event: type={}, tenantId={}",
                    event.getEventType(), event.getTenantId(), ex);
        }
    }
}
