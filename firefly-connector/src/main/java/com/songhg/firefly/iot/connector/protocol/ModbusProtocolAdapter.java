package com.songhg.firefly.iot.connector.protocol;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Modbus 协议适配器 — 将 Modbus 采集数据转为统一 DeviceMessage
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ModbusProtocolAdapter implements ProtocolAdapter {

    private final ObjectMapper objectMapper;

    @Override
    public String getProtocol() {
        return "MODBUS";
    }

    @Override
    public boolean supports(String topic) {
        return topic != null && topic.startsWith("/modbus/");
    }

    @Override
    public DeviceMessage decode(String topic, byte[] payload, Map<String, String> headers) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> data = objectMapper.readValue(payload, LinkedHashMap.class);

            Long deviceId = headers != null && headers.containsKey("deviceId") ? Long.parseLong(headers.get("deviceId")) : null;
            Long tenantId = headers != null && headers.containsKey("tenantId") ? Long.parseLong(headers.get("tenantId")) : null;
            Long productId = headers != null && headers.containsKey("productId") ? Long.parseLong(headers.get("productId")) : null;

            return DeviceMessage.builder()
                    .messageId(UUID.randomUUID().toString())
                    .tenantId(tenantId)
                    .productId(productId)
                    .deviceId(deviceId)
                    .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                    .topic(topic)
                    .payload(data)
                    .timestamp(System.currentTimeMillis())
                    .build();
        } catch (Exception e) {
            log.error("Failed to decode Modbus payload: {}", e.getMessage());
            return null;
        }
    }

    @Override
    public byte[] encode(DeviceMessage message) {
        try {
            return objectMapper.writeValueAsBytes(message.getPayload());
        } catch (Exception e) {
            log.error("Failed to encode Modbus message: {}", e.getMessage());
            return "{}".getBytes(StandardCharsets.UTF_8);
        }
    }
}
