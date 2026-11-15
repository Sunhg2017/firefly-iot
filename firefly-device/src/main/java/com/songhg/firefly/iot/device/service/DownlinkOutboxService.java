package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import com.songhg.firefly.iot.device.entity.DownlinkOutbox;
import com.songhg.firefly.iot.device.mapper.DownlinkOutboxMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 下行消息持久化 outbox：把「云端→设备」的指令先落库，保证 connector 重启或
 * Redis 数据丢失时也不会丢指令；未投递成功的记录由重试任务按退避重新发布到 Kafka，
 * 直到收到 connector 投递回执（DELIVERED）或达到最大重试次数（FAILED）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DownlinkOutboxService {

    private static final String STATUS_PENDING = "PENDING";
    private static final String STATUS_DELIVERED = "DELIVERED";
    private static final String STATUS_FAILED = "FAILED";

    private final DownlinkOutboxMapper downlinkOutboxMapper;
    private final ObjectMapper objectMapper;
    private final KafkaTemplate<String, String> kafkaTemplate;

    @Value("${firefly.downlink.outbox.max-attempts:5}")
    private int maxAttempts;

    @Value("${firefly.downlink.outbox.retry-base-seconds:30}")
    private long retryBaseSeconds;

    @Value("${firefly.downlink.outbox.retry-batch-size:200}")
    private int retryBatchSize;

    /**
     * 下行指令落库（幂等）。首次发布到 Kafka 由调用方 {@code publishDownstream} 完成，
     * 本方法只负责持久化；后续由 {@link #retryDue()} 兜底重发。
     */
    public void record(DeviceMessage message) {
        if (message == null || message.getDeviceId() == null || message.getMessageId() == null) {
            return;
        }
        try {
            DownlinkOutbox outbox = new DownlinkOutbox();
            outbox.setTenantId(message.getTenantId());
            outbox.setDeviceId(message.getDeviceId());
            outbox.setMessageId(message.getMessageId());
            outbox.setType(message.getType() == null ? null : message.getType().name());
            outbox.setTopic(message.getTopic());
            outbox.setPayload(objectMapper.writeValueAsString(message));
            outbox.setStatus(STATUS_PENDING);
            outbox.setAttempts(0);
            outbox.setMaxAttempts(Math.max(1, maxAttempts));
            outbox.setNextRetryAt(LocalDateTime.now().plusSeconds(Math.max(5, retryBaseSeconds)));
            downlinkOutboxMapper.insertIgnore(outbox);
        } catch (Exception ex) {
            log.error("Failed to record downlink outbox: deviceId={}, messageId={}, error={}",
                    message.getDeviceId(), message.getMessageId(), ex.getMessage());
        }
    }

    /**
     * connector 回执：标记已投递，停止重试。
     */
    public void markDelivered(Long deviceId, String messageId) {
        if (deviceId == null || messageId == null || messageId.isBlank()) {
            return;
        }
        LambdaUpdateWrapper<DownlinkOutbox> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(DownlinkOutbox::getDeviceId, deviceId)
                .eq(DownlinkOutbox::getMessageId, messageId)
                .eq(DownlinkOutbox::getStatus, STATUS_PENDING)
                .set(DownlinkOutbox::getStatus, STATUS_DELIVERED)
                .set(DownlinkOutbox::getUpdatedAt, LocalDateTime.now());
        downlinkOutboxMapper.update(null, wrapper);
    }

    /**
     * 重发到期的 PENDING 记录（由定时任务调用），失败按退避重试、超限置 FAILED。
     *
     * @return 本轮处理条数
     */
    public int retryDue() {
        LocalDateTime now = LocalDateTime.now();
        LambdaQueryWrapper<DownlinkOutbox> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(DownlinkOutbox::getStatus, STATUS_PENDING)
                .le(DownlinkOutbox::getNextRetryAt, now)
                .orderByAsc(DownlinkOutbox::getNextRetryAt)
                .last("LIMIT " + Math.max(1, retryBatchSize));
        List<DownlinkOutbox> due = downlinkOutboxMapper.selectList(wrapper);
        if (due.isEmpty()) {
            return 0;
        }
        for (DownlinkOutbox outbox : due) {
            retryOne(outbox);
        }
        return due.size();
    }

    private void retryOne(DownlinkOutbox outbox) {
        int attempts = (outbox.getAttempts() == null ? 0 : outbox.getAttempts()) + 1;
        int max = outbox.getMaxAttempts() == null ? maxAttempts : outbox.getMaxAttempts();
        try {
            kafkaTemplate.send(KafkaTopics.DEVICE_MESSAGE_DOWN,
                    String.valueOf(outbox.getDeviceId()), outbox.getPayload());
            if (attempts >= max) {
                markFailed(outbox, attempts, "达到最大重试次数仍未收到投递回执");
            } else {
                updateRetry(outbox, attempts, nextRetryAt(attempts), null);
            }
        } catch (Exception ex) {
            updateRetry(outbox, attempts, nextRetryAt(attempts), ex.getMessage());
        }
    }

    private void markFailed(DownlinkOutbox outbox, int attempts, String error) {
        LambdaUpdateWrapper<DownlinkOutbox> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(DownlinkOutbox::getId, outbox.getId())
                .set(DownlinkOutbox::getStatus, STATUS_FAILED)
                .set(DownlinkOutbox::getAttempts, attempts)
                .set(DownlinkOutbox::getLastError, error)
                .set(DownlinkOutbox::getUpdatedAt, LocalDateTime.now());
        downlinkOutboxMapper.update(null, wrapper);
    }

    private void updateRetry(DownlinkOutbox outbox, int attempts, LocalDateTime nextRetryAt, String error) {
        LambdaUpdateWrapper<DownlinkOutbox> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(DownlinkOutbox::getId, outbox.getId())
                .set(DownlinkOutbox::getAttempts, attempts)
                .set(DownlinkOutbox::getNextRetryAt, nextRetryAt)
                .set(DownlinkOutbox::getLastError, error)
                .set(DownlinkOutbox::getUpdatedAt, LocalDateTime.now());
        downlinkOutboxMapper.update(null, wrapper);
    }

    private LocalDateTime nextRetryAt(int attempts) {
        long backoffSeconds = Math.min(retryBaseSeconds * (1L << Math.max(0, attempts - 1)), Duration.ofHours(6).getSeconds());
        return LocalDateTime.now().plusSeconds(Math.max(5, backoffSeconds));
    }
}
