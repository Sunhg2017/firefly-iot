package com.songhg.firefly.iot.device.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DownlinkAck;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

/**
 * 消费 connector 的下行投递回执，把 outbox 中对应记录标记为 DELIVERED。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DownlinkAckConsumer {

    private final ObjectMapper objectMapper;
    private final DownlinkOutboxService downlinkOutboxService;

    @KafkaListener(topics = KafkaTopics.DEVICE_MESSAGE_DOWN_ACK, groupId = "firefly-downlink-ack-consumer")
    public void onAck(String payload) {
        DownlinkAck ack;
        try {
            ack = objectMapper.readValue(payload, DownlinkAck.class);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to deserialize downlink ack", ex);
        }
        if (ack.getDeviceId() == null || ack.getMessageId() == null) {
            log.warn("Skip invalid downlink ack: {}", payload);
            return;
        }
        downlinkOutboxService.markDelivered(ack.getDeviceId(), ack.getMessageId());
    }
}
