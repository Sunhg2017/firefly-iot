package com.songhg.firefly.iot.device.job;

import com.songhg.firefly.iot.device.service.DownlinkOutboxService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.UUID;

/**
 * 下行 outbox 重发任务：周期性重发到期的 PENDING 记录。
 * 使用 Redis 分布式锁保证多实例下只有一台执行，避免重复重发。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DownlinkOutboxRetryJob {

    private static final String LOCK_KEY = "lock:job:downlink-outbox-retry";
    private static final Duration LOCK_TTL = Duration.ofSeconds(30);

    private final DownlinkOutboxService downlinkOutboxService;
    private final StringRedisTemplate redisTemplate;

    @Scheduled(fixedDelayString = "${firefly.downlink.outbox.retry-interval-ms:10000}")
    public void retryDue() {
        String token = UUID.randomUUID().toString();
        boolean acquired;
        try {
            acquired = Boolean.TRUE.equals(redisTemplate.opsForValue().setIfAbsent(LOCK_KEY, token, LOCK_TTL));
        } catch (Exception ex) {
            log.warn("Downlink outbox retry lock check failed, skip this round: {}", ex.getMessage());
            return;
        }
        if (!acquired) {
            return;
        }
        try {
            int processed = downlinkOutboxService.retryDue();
            if (processed > 0) {
                log.info("Downlink outbox retry processed {} pending records", processed);
            }
        } catch (Exception ex) {
            log.error("Downlink outbox retry job failed: {}", ex.getMessage(), ex);
        }
    }
}
