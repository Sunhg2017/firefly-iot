package com.songhg.firefly.iot.device.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.device.dto.device.DeviceShadowDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceShadowService {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    private static final String SHADOW_KEY_PREFIX = "device:shadow:";

    private String shadowKey(Long deviceId) {
        return SHADOW_KEY_PREFIX + deviceId;
    }

    /**
     * 获取完整设备影子。
     */
    public DeviceShadowDTO getShadow(Long deviceId) {
        String key = shadowKey(deviceId);
        Map<Object, Object> hash = redisTemplate.opsForHash().entries(key);
        if (hash.isEmpty()) {
            DeviceShadowDTO dto = new DeviceShadowDTO();
            dto.setDeviceId(deviceId);
            dto.setDesired(Collections.emptyMap());
            dto.setReported(Collections.emptyMap());
            dto.setMetadata(Collections.emptyMap());
            dto.setVersion(0L);
            return dto;
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
     * 更新平台维护的 desired 期望值。
     */
    public DeviceShadowDTO updateDesired(Long deviceId, Map<String, Object> desired) {
        String key = shadowKey(deviceId);
        Map<String, Object> current = getDesired(key);
        current.putAll(desired);

        // null 表示删除该属性。
        current.entrySet().removeIf(entry -> entry.getValue() == null);

        long version = incrementVersion(key);
        redisTemplate.opsForHash().put(key, "desired", serialize(current));
        redisTemplate.opsForHash().put(key, "version", String.valueOf(version));
        redisTemplate.opsForHash().put(key, "updatedAt", LocalDateTime.now().toString());

        updateMetadata(key, desired, "desired");

        log.info("Device shadow desired updated: deviceId={}, version={}", deviceId, version);
        return getShadow(deviceId);
    }

    /**
     * 更新设备上报的 reported 状态。
     * 该方法只供设备消息链路内部调用，不向用户页面开放直接写入口。
     */
    public DeviceShadowDTO updateReported(Long deviceId, Map<String, Object> reported) {
        String key = shadowKey(deviceId);
        Map<String, Object> current = getReported(key);
        Map<String, Object> next = new LinkedHashMap<>(current);
        next.putAll(reported);

        next.entrySet().removeIf(entry -> entry.getValue() == null);
        // Effective no-op reports should not keep increasing the shadow version.
        if (next.equals(current)) {
            return getShadow(deviceId);
        }

        long version = incrementVersion(key);
        redisTemplate.opsForHash().put(key, "reported", serialize(next));
        redisTemplate.opsForHash().put(key, "version", String.valueOf(version));
        redisTemplate.opsForHash().put(key, "updatedAt", LocalDateTime.now().toString());

        updateMetadata(key, reported, "reported");

        log.debug("Device shadow reported updated: deviceId={}, version={}", deviceId, version);
        return getShadow(deviceId);
    }

    /**
     * 获取影子差异（desired - reported）。
     */
    public Map<String, Object> getDelta(Long deviceId) {
        String key = shadowKey(deviceId);
        Map<String, Object> desired = getDesired(key);
        Map<String, Object> reported = getReported(key);

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
     * 删除设备影子。
     */
    public void deleteShadow(Long deviceId) {
        redisTemplate.delete(shadowKey(deviceId));
        log.info("Device shadow deleted: deviceId={}", deviceId);
    }

    /**
     * 清空 desired 期望值。
     */
    public DeviceShadowDTO clearDesired(Long deviceId) {
        String key = shadowKey(deviceId);
        long version = incrementVersion(key);
        redisTemplate.opsForHash().put(key, "desired", serialize(Collections.emptyMap()));
        redisTemplate.opsForHash().put(key, "version", String.valueOf(version));
        redisTemplate.opsForHash().put(key, "updatedAt", LocalDateTime.now().toString());
        return getShadow(deviceId);
    }

    /**
     * Applies a property set reply in one shadow update:
     * reported is refreshed with the acknowledged values, and desired entries
     * that already converged to the same values are removed.
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

        String key = shadowKey(deviceId);
        Map<String, Object> currentDesired = getDesired(key);
        Map<String, Object> currentReported = getReported(key);

        Map<String, Object> nextDesired = new LinkedHashMap<>(currentDesired);
        Map<String, Object> nextReported = new LinkedHashMap<>(currentReported);
        nextReported.putAll(acknowledged);
        nextReported.entrySet().removeIf(entry -> entry.getValue() == null);

        for (Map.Entry<String, Object> entry : acknowledged.entrySet()) {
            Object desiredValue = nextDesired.get(entry.getKey());
            if (Objects.equals(desiredValue, entry.getValue())) {
                nextDesired.remove(entry.getKey());
            }
        }

        if (nextDesired.equals(currentDesired) && nextReported.equals(currentReported)) {
            return getShadow(deviceId);
        }

        long version = incrementVersion(key);
        redisTemplate.opsForHash().put(key, "desired", serialize(nextDesired));
        redisTemplate.opsForHash().put(key, "reported", serialize(nextReported));
        redisTemplate.opsForHash().put(key, "version", String.valueOf(version));
        redisTemplate.opsForHash().put(key, "updatedAt", LocalDateTime.now().toString());
        updateMetadata(key, acknowledged, "propertySetReply");

        log.debug("Device shadow reconciled by property set reply: deviceId={}, version={}", deviceId, version);
        return getShadow(deviceId);
    }

    private Map<String, Object> getDesired(String key) {
        return deserializeMap(redisTemplate.opsForHash().get(key, "desired"));
    }

    private Map<String, Object> getReported(String key) {
        return deserializeMap(redisTemplate.opsForHash().get(key, "reported"));
    }

    private long incrementVersion(String key) {
        Long version = redisTemplate.opsForHash().increment(key, "version", 1);
        return version != null ? version : 1;
    }

    private void updateMetadata(String key, Map<String, Object> props, String source) {
        Map<String, Object> metadata = deserializeMap(redisTemplate.opsForHash().get(key, "metadata"));
        String now = LocalDateTime.now().toString();
        for (String prop : props.keySet()) {
            Map<String, Object> propMeta = new LinkedHashMap<>();
            propMeta.put("timestamp", now);
            propMeta.put("source", source);
            metadata.put(prop, propMeta);
        }
        redisTemplate.opsForHash().put(key, "metadata", serialize(metadata));
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
            log.error("Failed to deserialize shadow data", e);
            return new LinkedHashMap<>();
        }
    }

    private long parseLong(Object val) {
        if (val == null) {
            return 0;
        }
        try {
            return Long.parseLong(val.toString());
        } catch (Exception e) {
            return 0;
        }
    }
}
