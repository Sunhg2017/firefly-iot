package com.songhg.firefly.iot.device.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.device.dto.device.DeviceShadowDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

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
     * 获取完整影子文档
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
     * 更新期望属性（desired）— 由云端下发
     */
    public DeviceShadowDTO updateDesired(Long deviceId, Map<String, Object> desired) {
        String key = shadowKey(deviceId);
        Map<String, Object> current = getDesired(key);
        current.putAll(desired);

        // 移除 null 值的属性（表示删除）
        current.entrySet().removeIf(e -> e.getValue() == null);

        long version = incrementVersion(key);
        redisTemplate.opsForHash().put(key, "desired", serialize(current));
        redisTemplate.opsForHash().put(key, "version", String.valueOf(version));
        redisTemplate.opsForHash().put(key, "updatedAt", LocalDateTime.now().toString());

        updateMetadata(key, desired, "desired");

        log.info("Device shadow desired updated: deviceId={}, version={}", deviceId, version);
        return getShadow(deviceId);
    }

    /**
     * 更新上报属性（reported）— 由设备上报
     */
    public DeviceShadowDTO updateReported(Long deviceId, Map<String, Object> reported) {
        String key = shadowKey(deviceId);
        Map<String, Object> current = getReported(key);
        current.putAll(reported);

        current.entrySet().removeIf(e -> e.getValue() == null);

        long version = incrementVersion(key);
        redisTemplate.opsForHash().put(key, "reported", serialize(current));
        redisTemplate.opsForHash().put(key, "version", String.valueOf(version));
        redisTemplate.opsForHash().put(key, "updatedAt", LocalDateTime.now().toString());

        updateMetadata(key, reported, "reported");

        log.info("Device shadow reported updated: deviceId={}, version={}", deviceId, version);
        return getShadow(deviceId);
    }

    /**
     * 获取影子差异（desired - reported）
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
     * 删除影子
     */
    public void deleteShadow(Long deviceId) {
        redisTemplate.delete(shadowKey(deviceId));
        log.info("Device shadow deleted: deviceId={}", deviceId);
    }

    /**
     * 清空期望属性
     */
    public DeviceShadowDTO clearDesired(Long deviceId) {
        String key = shadowKey(deviceId);
        long version = incrementVersion(key);
        redisTemplate.opsForHash().put(key, "desired", serialize(Collections.emptyMap()));
        redisTemplate.opsForHash().put(key, "version", String.valueOf(version));
        redisTemplate.opsForHash().put(key, "updatedAt", LocalDateTime.now().toString());
        return getShadow(deviceId);
    }

    // ==================== Internal Helpers ====================

    private Map<String, Object> getDesired(String key) {
        return deserializeMap(redisTemplate.opsForHash().get(key, "desired"));
    }

    private Map<String, Object> getReported(String key) {
        return deserializeMap(redisTemplate.opsForHash().get(key, "reported"));
    }

    private long incrementVersion(String key) {
        Long v = redisTemplate.opsForHash().increment(key, "version", 1);
        return v != null ? v : 1;
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
        if (json == null) return new LinkedHashMap<>();
        try {
            if (json instanceof String str) {
                return objectMapper.readValue(str, new TypeReference<LinkedHashMap<String, Object>>() {});
            }
            return (Map<String, Object>) json;
        } catch (Exception e) {
            log.error("Failed to deserialize shadow data", e);
            return new LinkedHashMap<>();
        }
    }

    private long parseLong(Object val) {
        if (val == null) return 0;
        try { return Long.parseLong(val.toString()); } catch (Exception e) { return 0; }
    }
}
