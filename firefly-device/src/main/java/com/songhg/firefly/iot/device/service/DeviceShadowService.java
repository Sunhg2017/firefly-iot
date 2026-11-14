package com.songhg.firefly.iot.device.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.device.dto.device.DeviceShadowDTO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.DeviceShadowRecord;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.DeviceShadowMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * 设备影子。
 *
 * <p>可靠性约定：</p>
 * <ul>
 *   <li>desired（期望状态）以数据库 {@code device_shadow} 为权威副本，Redis 仅作缓存；
 *       数据库内用 JSONB 原子合并 + 版本自增，避免多实例读改写丢失更新。</li>
 *   <li>reported（设备上报状态）只存 Redis，属于可重建的实时状态；读改写用设备级 Redis 锁串行化。</li>
 *   <li>Redis 缓存带 TTL；缓存缺失时从数据库回源 desired，避免淘汰/重启后期望状态丢失。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceShadowService {

    private static final String SHADOW_KEY_PREFIX = "device:shadow:";
    private static final String SHADOW_LOCK_PREFIX = "device:shadow:lock:";

    /**
     * 仅当锁值匹配时才删除，避免误删其他实例已续期的锁。
     */
    private static final RedisScript<Long> UNLOCK_SCRIPT = new DefaultRedisScript<>(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            Long.class);

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final DeviceShadowMapper shadowMapper;
    private final DeviceMapper deviceMapper;

    @Value("${firefly.shadow.redis-ttl-days:7}")
    private long shadowTtlDays;

    @Value("${firefly.shadow.lock-ttl-ms:3000}")
    private long lockTtlMs;

    private String shadowKey(Long deviceId) {
        return SHADOW_KEY_PREFIX + deviceId;
    }

    /**
     * 获取完整设备影子；Redis 缺失时从数据库回源 desired。
     */
    public DeviceShadowDTO getShadow(Long deviceId) {
        String key = shadowKey(deviceId);
        Map<Object, Object> hash = redisTemplate.opsForHash().entries(key);
        if (hash.isEmpty() || hash.get("desired") == null) {
            return loadFromDatabase(deviceId);
        }

        DeviceShadowDTO dto = new DeviceShadowDTO();
        dto.setDeviceId(deviceId);
        dto.setDesired(deserializeMap(hash.get("desired")));
        dto.setReported(deserializeMap(hash.get("reported")));
        dto.setMetadata(deserializeMap(hash.get("metadata")));
        dto.setVersion(parseLong(hash.get("version")));
        dto.setUpdatedAt(hash.get("updatedAt") != null ? hash.get("updatedAt").toString() : null);
        return dto;
    }

    /**
     * 更新平台维护的 desired 期望值（数据库原子合并，Redis 回写缓存）。
     */
    public DeviceShadowDTO updateDesired(Long deviceId, Map<String, Object> desired) {
        if (desired == null || desired.isEmpty()) {
            return getShadow(deviceId);
        }
        Long tenantId = resolveTenantId(deviceId);
        DeviceShadowRecord record = shadowMapper.mergeDesired(deviceId, tenantId, serialize(desired));
        if (record == null) {
            log.error("Failed to persist shadow desired: deviceId={}", deviceId);
            return getShadow(deviceId);
        }
        writeDesiredCache(deviceId, record.getDesired(), record.getVersion());
        updateMetadata(deviceId, desired, "desired");
        log.info("Device shadow desired updated: deviceId={}, version={}", deviceId, record.getVersion());
        return getShadow(deviceId);
    }

    /**
     * 更新设备上报的 reported 状态（Redis 实时状态，设备级锁串行化读改写）。
     */
    public DeviceShadowDTO updateReported(Long deviceId, Map<String, Object> reported) {
        return withDeviceLock(deviceId, () -> {
            String key = shadowKey(deviceId);
            Map<String, Object> current = getReported(key);
            Map<String, Object> next = new LinkedHashMap<>(current);
            next.putAll(reported);
            next.entrySet().removeIf(entry -> entry.getValue() == null);
            // 无变化的 reported 不应持续推高版本号。
            if (next.equals(current)) {
                return getShadow(deviceId);
            }
            long version = incrementVersion(key);
            putHashAndTouchTtl(key, "reported", serialize(next), "version", String.valueOf(version),
                    "updatedAt", LocalDateTime.now().toString());
            updateMetadata(deviceId, reported, "reported");
            log.debug("Device shadow reported updated: deviceId={}, version={}", deviceId, version);
            return getShadow(deviceId);
        });
    }

    /**
     * 获取影子差异（desired - reported）。
     */
    public Map<String, Object> getDelta(Long deviceId) {
        DeviceShadowDTO shadow = getShadow(deviceId);
        Map<String, Object> desired = shadow.getDesired() == null ? Collections.emptyMap() : shadow.getDesired();
        Map<String, Object> reported = shadow.getReported() == null ? Collections.emptyMap() : shadow.getReported();

        Map<String, Object> delta = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : desired.entrySet()) {
            String prop = entry.getKey();
            Object desiredVal = entry.getValue();
            Object reportedVal = reported.get(prop);
            if (!Objects.equals(desiredVal, reportedVal)) {
                delta.put(prop, desiredVal);
            }
        }
        return delta;
    }

    /**
     * 删除设备影子（Redis + 数据库权威副本）。
     */
    public void deleteShadow(Long deviceId) {
        redisTemplate.delete(shadowKey(deviceId));
        shadowMapper.deleteByDeviceIdIgnoreTenant(deviceId);
        log.info("Device shadow deleted: deviceId={}", deviceId);
    }

    /**
     * 清空 desired 期望值。
     */
    public DeviceShadowDTO clearDesired(Long deviceId) {
        Long tenantId = resolveTenantId(deviceId);
        DeviceShadowRecord record = shadowMapper.replaceDesired(deviceId, tenantId, "{}");
        if (record != null) {
            writeDesiredCache(deviceId, record.getDesired(), record.getVersion());
            touchTtl(shadowKey(deviceId));
        }
        return getShadow(deviceId);
    }

    /**
     * 属性设置回执：reported 刷新，已收敛的 desired 键被移除。
     */
    public DeviceShadowDTO applyPropertySetReply(Long deviceId, Map<String, Object> acknowledged) {
        if (deviceId == null) {
            DeviceShadowDTO dto = new DeviceShadowDTO();
            dto.setDesired(Collections.emptyMap());
            dto.setReported(Collections.emptyMap());
            dto.setMetadata(Collections.emptyMap());
            dto.setVersion(0L);
            return dto;
        }
        if (acknowledged == null || acknowledged.isEmpty()) {
            return getShadow(deviceId);
        }

        return withDeviceLock(deviceId, () -> {
            DeviceShadowDTO current = getShadow(deviceId);
            Map<String, Object> currentDesired = current.getDesired() == null
                    ? new LinkedHashMap<>() : new LinkedHashMap<>(current.getDesired());
            Map<String, Object> currentReported = current.getReported() == null
                    ? new LinkedHashMap<>() : new LinkedHashMap<>(current.getReported());

            Map<String, Object> nextReported = new LinkedHashMap<>(currentReported);
            nextReported.putAll(acknowledged);
            nextReported.entrySet().removeIf(entry -> entry.getValue() == null);

            // 已收敛的 desired 键通过 null 增量由数据库原子剔除。
            Map<String, Object> removalDelta = new LinkedHashMap<>();
            for (Map.Entry<String, Object> entry : acknowledged.entrySet()) {
                if (Objects.equals(currentDesired.get(entry.getKey()), entry.getValue())) {
                    removalDelta.put(entry.getKey(), null);
                    currentDesired.remove(entry.getKey());
                }
            }

            if (removalDelta.isEmpty() && nextReported.equals(currentReported)) {
                return current;
            }

            String key = shadowKey(deviceId);
            long version;
            if (!removalDelta.isEmpty()) {
                Long tenantId = resolveTenantId(deviceId);
                DeviceShadowRecord record = shadowMapper.mergeDesired(deviceId, tenantId, serialize(removalDelta));
                version = record != null ? record.getVersion() : incrementVersion(key);
                if (record != null) {
                    writeDesiredCache(deviceId, record.getDesired(), version);
                }
            } else {
                version = incrementVersion(key);
            }
            putHashAndTouchTtl(key, "reported", serialize(nextReported), "version", String.valueOf(version),
                    "updatedAt", LocalDateTime.now().toString());
            updateMetadata(deviceId, acknowledged, "propertySetReply");
            log.debug("Device shadow reconciled by property set reply: deviceId={}, version={}", deviceId, version);
            return getShadow(deviceId);
        });
    }

    private DeviceShadowDTO loadFromDatabase(Long deviceId) {
        DeviceShadowRecord record = shadowMapper.selectByDeviceIdIgnoreTenant(deviceId);
        DeviceShadowDTO dto = new DeviceShadowDTO();
        dto.setDeviceId(deviceId);
        dto.setDesired(record != null ? deserializeMap(record.getDesired()) : Collections.emptyMap());
        dto.setReported(Collections.emptyMap());
        dto.setMetadata(Collections.emptyMap());
        dto.setVersion(record != null && record.getVersion() != null ? record.getVersion() : 0L);
        if (record == null) {
            return dto;
        }
        // 回源后重建 Redis 缓存，后续读取走缓存。
        String key = shadowKey(deviceId);
        putHashAndTouchTtl(key,
                "desired", record.getDesired(),
                "reported", "{}",
                "metadata", "{}",
                "version", String.valueOf(dto.getVersion()),
                "updatedAt", record.getUpdatedAt() == null ? LocalDateTime.now().toString() : record.getUpdatedAt().toString());
        log.info("Device shadow rebuilt from database: deviceId={}, version={}", deviceId, dto.getVersion());
        return dto;
    }

    private void writeDesiredCache(Long deviceId, String desiredJson, Long version) {
        String key = shadowKey(deviceId);
        putHashAndTouchTtl(key,
                "desired", desiredJson == null ? "{}" : desiredJson,
                "version", String.valueOf(version == null ? 0L : version),
                "updatedAt", LocalDateTime.now().toString());
    }

    private void putHashAndTouchTtl(String key, String... fieldValues) {
        Map<String, String> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < fieldValues.length; i += 2) {
            map.put(fieldValues[i], fieldValues[i + 1]);
        }
        redisTemplate.opsForHash().putAll(key, map);
        touchTtl(key);
    }

    private void touchTtl(String key) {
        redisTemplate.expire(key, Duration.ofDays(Math.max(1, shadowTtlDays)));
    }

    private Map<String, Object> getReported(String key) {
        return deserializeMap(redisTemplate.opsForHash().get(key, "reported"));
    }

    private long incrementVersion(String key) {
        Long version = redisTemplate.opsForHash().increment(key, "version", 1);
        return version != null ? version : 1;
    }

    private void updateMetadata(Long deviceId, Map<String, Object> props, String source) {
        String key = shadowKey(deviceId);
        Map<String, Object> metadata = deserializeMap(redisTemplate.opsForHash().get(key, "metadata"));
        String now = LocalDateTime.now().toString();
        for (String prop : props.keySet()) {
            Map<String, Object> propMeta = new LinkedHashMap<>();
            propMeta.put("timestamp", now);
            propMeta.put("source", source);
            metadata.put(prop, propMeta);
        }
        redisTemplate.opsForHash().put(key, "metadata", serialize(metadata));
        touchTtl(key);
    }

    /**
     * 设备级 Redis 锁：串行化 reported 的读改写，锁获取失败时降级为无锁执行并告警。
     */
    private <T> T withDeviceLock(Long deviceId, Supplier<T> action) {
        String lockKey = SHADOW_LOCK_PREFIX + deviceId;
        String token = UUID.randomUUID().toString();
        boolean locked = false;
        try {
            for (int attempt = 0; attempt < 3 && !locked; attempt++) {
                locked = Boolean.TRUE.equals(redisTemplate.opsForValue()
                        .setIfAbsent(lockKey, token, Duration.ofMillis(Math.max(500, lockTtlMs))));
                if (!locked) {
                    Thread.sleep(20L);
                }
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        } catch (Exception ex) {
            log.warn("Failed to acquire shadow lock: deviceId={}, error={}", deviceId, ex.getMessage());
        }
        if (!locked) {
            log.warn("Shadow lock not acquired, proceed without lock: deviceId={}", deviceId);
        }
        try {
            return action.get();
        } finally {
            if (locked) {
                try {
                    redisTemplate.execute(UNLOCK_SCRIPT, List.of(lockKey), token);
                } catch (Exception ex) {
                    log.warn("Failed to release shadow lock: deviceId={}, error={}", deviceId, ex.getMessage());
                }
            }
        }
    }

    private Long resolveTenantId(Long deviceId) {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId != null) {
            return tenantId;
        }
        Device device = deviceMapper.selectByIdIgnoreTenant(deviceId);
        return device == null ? null : device.getTenantId();
    }

    private String serialize(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            log.error("Failed to serialize shadow data", e);
            return "{}";
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> deserializeMap(Object json) {
        if (json == null) {
            return new LinkedHashMap<>();
        }
        try {
            if (json instanceof String str) {
                return objectMapper.readValue(str, new TypeReference<LinkedHashMap<String, Object>>() {
                });
            }
            return (Map<String, Object>) json;
        } catch (Exception e) {
            log.warn("Failed to deserialize shadow data: {}", e.getMessage());
            return new LinkedHashMap<>();
        }
    }

    private long parseLong(Object value) {
        if (value == null) {
            return 0L;
        }
        try {
            return Long.parseLong(value.toString());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }
}
