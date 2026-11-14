package com.songhg.firefly.iot.connector.protocol.downstream;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.metrics.Metrics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * 下行待投递队列：设备离线或本节点无在线路由时，把下行消息暂存 Redis，
 * 设备重连后补发。队列按设备隔离、按 messageId 去重、有界并带 TTL，避免 DLT 积压与无界内存增长。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DownlinkPendingQueue {

    private static final String PENDING_PREFIX = "connector:downlink:pending:";
    private static final String SEEN_PREFIX = "connector:downlink:seen:";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @Value("${firefly.downlink.pending-max-per-device:100}")
    private int pendingMaxPerDevice;

    @Value("${firefly.downlink.pending-ttl-hours:24}")
    private long pendingTtlHours;

    @Value("${firefly.downlink.seen-ttl-minutes:60}")
    private long seenTtlMinutes;

    /**
     * 入队（按 messageId 去重）；设备在线但路由暂不可用时也走这里，等待重连补发。
     */
    public void enqueue(DeviceMessage message) {
        if (message == null || message.getDeviceId() == null || message.getMessageId() == null) {
            return;
        }
        try {
            String seenKey = SEEN_PREFIX + message.getDeviceId() + ":" + message.getMessageId();
            Boolean first = redisTemplate.opsForValue()
                    .setIfAbsent(seenKey, "1", Duration.ofMinutes(Math.max(1, seenTtlMinutes)));
            if (!Boolean.TRUE.equals(first)) {
                log.debug("Skip duplicate pending downlink: deviceId={}, messageId={}",
                        message.getDeviceId(), message.getMessageId());
                return;
            }
            push(message);
            Metrics.increment("firefly.connector.downlink.pending",
                    "type", message.getType() == null ? "UNKNOWN" : message.getType().name());
        } catch (Exception ex) {
            log.error("Failed to enqueue pending downlink: deviceId={}, error={}",
                    message.getDeviceId(), ex.getMessage());
        }
    }

    /**
     * 补发失败时重新入队，跳过去重标记（该消息已被消费过一次）。
     */
    public void requeue(DeviceMessage message) {
        if (message == null || message.getDeviceId() == null) {
            return;
        }
        try {
            push(message);
        } catch (Exception ex) {
            log.error("Failed to requeue pending downlink: deviceId={}, error={}",
                    message.getDeviceId(), ex.getMessage());
        }
    }

    /**
     * 取走设备积压消息（从队头按顺序），供重连补发使用。
     */
    public List<DeviceMessage> drain(Long deviceId, int maxCount) {
        List<DeviceMessage> messages = new ArrayList<>();
        if (deviceId == null || maxCount <= 0) {
            return messages;
        }
        String key = PENDING_PREFIX + deviceId;
        for (int i = 0; i < maxCount; i++) {
            String json;
            try {
                json = redisTemplate.opsForList().leftPop(key);
            } catch (Exception ex) {
                log.error("Failed to drain pending downlink: deviceId={}, error={}", deviceId, ex.getMessage());
                break;
            }
            if (json == null) {
                break;
            }
            try {
                messages.add(objectMapper.readValue(json, DeviceMessage.class));
            } catch (Exception ex) {
                log.warn("Discard invalid pending downlink: deviceId={}, error={}", deviceId, ex.getMessage());
            }
        }
        return messages;
    }

    private void push(DeviceMessage message) throws Exception {
        String key = PENDING_PREFIX + message.getDeviceId();
        String json = objectMapper.writeValueAsString(message);
        redisTemplate.opsForList().rightPush(key, json);
        redisTemplate.opsForList().trim(key, -Math.max(1, pendingMaxPerDevice), -1);
        redisTemplate.expire(key, Duration.ofHours(Math.max(1, pendingTtlHours)));
    }
}
