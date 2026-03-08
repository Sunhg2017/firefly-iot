package com.songhg.firefly.iot.connector.protocol;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Component
@RequiredArgsConstructor
public class MessageCodec {

    private final ObjectMapper objectMapper;

    // MQTT topic pattern: /sys/{productKey}/{deviceName}/{action}
    private static final Pattern MQTT_TOPIC_PATTERN = Pattern.compile("^/sys/([^/]+)/([^/]+)/(.+)$");

    /**
     * 解析 MQTT topic 获取消息类型
     */
    public DeviceMessage.MessageType resolveTypeFromTopic(String topic) {
        if (topic == null) return null;
        String action = extractAction(topic);
        if (action == null) return DeviceMessage.MessageType.RAW_DATA;

        return switch (action) {
            case "thing/property/post" -> DeviceMessage.MessageType.PROPERTY_REPORT;
            case "thing/event/post" -> DeviceMessage.MessageType.EVENT_REPORT;
            case "thing/service/reply" -> DeviceMessage.MessageType.SERVICE_REPLY;
            case "thing/property/set/reply" -> DeviceMessage.MessageType.PROPERTY_SET_REPLY;
            case "ota/progress" -> DeviceMessage.MessageType.OTA_PROGRESS;
            default -> DeviceMessage.MessageType.RAW_DATA;
        };
    }

    /**
     * 解码 JSON payload 为 DeviceMessage
     */
    public DeviceMessage decodeJson(String topic, byte[] payload, Long deviceId, Long tenantId, Long productId) {
        try {
            Map<String, Object> data = objectMapper.readValue(payload, new TypeReference<LinkedHashMap<String, Object>>() {});
            String messageId = data.containsKey("id") ? String.valueOf(data.get("id")) : UUID.randomUUID().toString();

            @SuppressWarnings("unchecked")
            Map<String, Object> params = data.containsKey("params") ? (Map<String, Object>) data.get("params") : data;

            return DeviceMessage.builder()
                    .messageId(messageId)
                    .tenantId(tenantId)
                    .productId(productId)
                    .deviceId(deviceId)
                    .type(resolveTypeFromTopic(topic))
                    .topic(topic)
                    .payload(params)
                    .timestamp(System.currentTimeMillis())
                    .build();
        } catch (Exception e) {
            log.error("Failed to decode JSON payload: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 编码 DeviceMessage 为下行 JSON bytes
     */
    public byte[] encodeJson(DeviceMessage message) {
        try {
            Map<String, Object> envelope = new LinkedHashMap<>();
            envelope.put("id", message.getMessageId());
            envelope.put("method", resolveDownstreamMethod(message.getType()));
            envelope.put("params", message.getPayload());
            envelope.put("timestamp", message.getTimestamp());
            return objectMapper.writeValueAsBytes(envelope);
        } catch (Exception e) {
            log.error("Failed to encode message: {}", e.getMessage());
            return "{}".getBytes(StandardCharsets.UTF_8);
        }
    }

    /**
     * 构建下行 MQTT topic
     */
    public String buildDownstreamTopic(String productKey, String deviceName, DeviceMessage.MessageType type) {
        String action = switch (type) {
            case PROPERTY_SET -> "thing/property/set";
            case SERVICE_INVOKE -> "thing/service/invoke";
            default -> "thing/downstream";
        };
        return "/sys/" + productKey + "/" + deviceName + "/" + action;
    }

    /**
     * 从 MQTT topic 提取 productKey 和 deviceName
     */
    public String[] extractIdentity(String topic) {
        Matcher m = MQTT_TOPIC_PATTERN.matcher(topic);
        if (m.matches()) {
            return new String[]{m.group(1), m.group(2)};
        }
        return null;
    }

    private String extractAction(String topic) {
        Matcher m = MQTT_TOPIC_PATTERN.matcher(topic);
        if (m.matches()) {
            return m.group(3);
        }
        return null;
    }

    private String resolveDownstreamMethod(DeviceMessage.MessageType type) {
        if (type == null) return "thing.downstream";
        return switch (type) {
            case PROPERTY_SET -> "thing.property.set";
            case SERVICE_INVOKE -> "thing.service.invoke";
            default -> "thing.downstream";
        };
    }
}
