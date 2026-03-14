package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.config.HttpProtocolProperties;
import com.songhg.firefly.iot.connector.protocol.dto.DeviceAuthResult;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class HttpDeviceLifecycleService {

    private static final String LAST_SEEN_KEY = "connector:http:device:last-seen";
    private static final String ONLINE_MARKER_PREFIX = "connector:http:device:online:";
    private static final int SWEEP_BATCH_SIZE = 128;

    private final HttpProtocolProperties httpProtocolProperties;
    private final StringRedisTemplate redisTemplate;
    private final DeviceMessageProducer messageProducer;

    /**
     * HTTP 是无连接协议，没有天然的 connect/disconnect 事件。
     * 这里把每次成功的业务请求或心跳请求都视为一次活跃刷新：
     * - 首次活跃：发 DEVICE_ONLINE
     * - 后续活跃：仅刷新 TTL 和 last-seen，不重复发上线事件
     */
    public void markActive(DeviceAuthResult auth, String trigger) {
        if (auth == null || !auth.isSuccess() || auth.getDeviceId() == null) {
            return;
        }

        String member = buildMember(auth);
        String markerKey = buildMarkerKey(member);
        long now = System.currentTimeMillis();
        Duration timeout = Duration.ofSeconds(httpProtocolProperties.getPresenceTimeoutSeconds());

        Boolean firstSeen = redisTemplate.opsForValue().setIfAbsent(markerKey, String.valueOf(now), timeout);
        if (!Boolean.TRUE.equals(firstSeen)) {
            redisTemplate.opsForValue().set(markerKey, String.valueOf(now), timeout);
        }
        redisTemplate.opsForZSet().add(LAST_SEEN_KEY, member, now);

        if (Boolean.TRUE.equals(firstSeen)) {
            publishLifecycle(auth, DeviceMessage.MessageType.DEVICE_ONLINE, Map.of(
                    "protocol", "HTTP",
                    "trigger", trigger
            ));
            log.info("HTTP device online: deviceId={}, trigger={}", auth.getDeviceId(), trigger);
        }
    }

    @Scheduled(
            fixedDelayString = "#{@httpProtocolProperties.getPresenceSweepIntervalSeconds() * 1000}",
            initialDelayString = "#{@httpProtocolProperties.getPresenceSweepIntervalSeconds() * 1000}"
    )
    public void sweepExpiredDevices() {
        long cutoff = System.currentTimeMillis() - httpProtocolProperties.getPresenceTimeoutSeconds() * 1000;
        while (sweepExpiredBatch(cutoff) == SWEEP_BATCH_SIZE) {
            // Continue draining stale candidates in bounded batches.
        }
    }

    private int sweepExpiredBatch(long cutoff) {
        Set<String> staleMembers = redisTemplate.opsForZSet().rangeByScore(LAST_SEEN_KEY, 0, cutoff, 0, SWEEP_BATCH_SIZE);
        if (staleMembers == null || staleMembers.isEmpty()) {
            return 0;
        }

        int processed = 0;
        for (String member : staleMembers) {
            processed++;
            if (member == null || member.isBlank()) {
                redisTemplate.opsForZSet().remove(LAST_SEEN_KEY, member);
                continue;
            }

            String markerKey = buildMarkerKey(member);
            if (Boolean.TRUE.equals(redisTemplate.hasKey(markerKey))) {
                continue;
            }

            Double score = redisTemplate.opsForZSet().score(LAST_SEEN_KEY, member);
            if (score == null || score.longValue() > cutoff) {
                continue;
            }

            Long removed = redisTemplate.opsForZSet().remove(LAST_SEEN_KEY, member);
            if (removed == null || removed <= 0) {
                continue;
            }

            HttpPresenceMember parsed = parseMember(member);
            if (parsed == null) {
                continue;
            }

            publishLifecycle(parsed, DeviceMessage.MessageType.DEVICE_OFFLINE, Map.of(
                    "protocol", "HTTP",
                    "reason", "heartbeat_timeout"
            ));
            log.info("HTTP device offline by timeout: deviceId={}, timeout={}s",
                    parsed.deviceId(), httpProtocolProperties.getPresenceTimeoutSeconds());
        }
        return processed;
    }

    private void publishLifecycle(DeviceAuthResult auth,
                                  DeviceMessage.MessageType type,
                                  Map<String, Object> payload) {
        messageProducer.publishUpstream(DeviceMessage.builder()
                .tenantId(auth.getTenantId())
                .productId(auth.getProductId())
                .deviceId(auth.getDeviceId())
                .type(type)
                .topic("/sys/http/" + auth.getDeviceId() + "/lifecycle/" + type.name().toLowerCase())
                .payload(payload)
                .timestamp(System.currentTimeMillis())
                .build());
    }

    private void publishLifecycle(HttpPresenceMember member,
                                  DeviceMessage.MessageType type,
                                  Map<String, Object> payload) {
        messageProducer.publishUpstream(DeviceMessage.builder()
                .tenantId(member.tenantId())
                .productId(member.productId())
                .deviceId(member.deviceId())
                .type(type)
                .topic("/sys/http/" + member.deviceId() + "/lifecycle/" + type.name().toLowerCase())
                .payload(payload)
                .timestamp(System.currentTimeMillis())
                .build());
    }

    private String buildMember(DeviceAuthResult auth) {
        return auth.getTenantId() + ":" + auth.getProductId() + ":" + auth.getDeviceId();
    }

    private String buildMarkerKey(String member) {
        return ONLINE_MARKER_PREFIX + member;
    }

    private HttpPresenceMember parseMember(String member) {
        String[] parts = member.split(":");
        if (parts.length != 3) {
            log.warn("Invalid HTTP presence member: {}", member);
            return null;
        }
        try {
            return new HttpPresenceMember(
                    Long.parseLong(parts[0]),
                    Long.parseLong(parts[1]),
                    Long.parseLong(parts[2])
            );
        } catch (NumberFormatException ex) {
            log.warn("Invalid HTTP presence member numbers: {}", member, ex);
            return null;
        }
    }

    private record HttpPresenceMember(Long tenantId, Long productId, Long deviceId) {
    }
}
