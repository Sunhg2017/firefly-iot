package com.songhg.firefly.iot.connector.protocol.lorawan;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.protocol.ProtocolAdapter;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * LoRaWAN 协议适配器 — 将 LoRaWAN 网络服务器推送的上行数据转为统一 DeviceMessage 并发布到 Kafka
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LoRaWanProtocolAdapter implements ProtocolAdapter {

    private final ObjectMapper objectMapper;
    private final DeviceMessageProducer messageProducer;

    @Override
    public String getProtocol() {
        return "LORAWAN";
    }

    @Override
    public boolean supports(String topic) {
        return topic != null && topic.startsWith("/lorawan/");
    }

    @Override
    public DeviceMessage decode(String topic, byte[] payload, Map<String, String> headers) {
        try {
            Map<String, Object> data = new LinkedHashMap<>();
            String payloadStr = new String(payload, StandardCharsets.UTF_8).trim();

            // Try JSON parse
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> parsed = objectMapper.readValue(payloadStr, LinkedHashMap.class);
                data = parsed;
            } catch (Exception e) {
                data.put("raw", payloadStr);
            }

            // Enrich with LoRaWAN headers
            if (headers != null) {
                data.put("_devEui", headers.getOrDefault("devEui", ""));
                data.put("_applicationId", headers.getOrDefault("applicationId", ""));
                data.put("_fPort", headers.getOrDefault("fPort", "0"));
                data.put("_fCnt", headers.getOrDefault("fCnt", "0"));
                data.put("_gatewayId", headers.getOrDefault("gatewayId", ""));
                data.put("_rssi", headers.getOrDefault("rssi", ""));
                data.put("_snr", headers.getOrDefault("snr", ""));
            }

            return DeviceMessage.builder()
                    .messageId(UUID.randomUUID().toString())
                    .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                    .topic(topic)
                    .payload(data)
                    .timestamp(System.currentTimeMillis())
                    .build();
        } catch (Exception e) {
            log.error("Failed to decode LoRaWAN payload: {}", e.getMessage());
            return null;
        }
    }

    @Override
    public byte[] encode(DeviceMessage message) {
        try {
            return objectMapper.writeValueAsBytes(message.getPayload());
        } catch (Exception e) {
            log.error("Failed to encode LoRaWAN message: {}", e.getMessage());
            return "{}".getBytes(StandardCharsets.UTF_8);
        }
    }

    /**
     * 处理 LoRaWAN 上行消息并发布到 Kafka
     */
    public void handleUplink(LoRaWanMessage msg) {
        try {
            Map<String, String> headers = new HashMap<>();
            headers.put("devEui", msg.getDevEui() != null ? msg.getDevEui() : "");
            headers.put("applicationId", msg.getApplicationId() != null ? msg.getApplicationId() : "");
            headers.put("fPort", String.valueOf(msg.getFPort()));
            headers.put("fCnt", String.valueOf(msg.getFCnt()));

            // Extract best gateway info
            if (msg.getRxInfo() != null && msg.getRxInfo().length > 0) {
                LoRaWanMessage.RxInfo best = msg.getRxInfo()[0];
                headers.put("gatewayId", best.getGatewayId() != null ? best.getGatewayId() : "");
                headers.put("rssi", String.valueOf(best.getRssi()));
                headers.put("snr", String.valueOf(best.getSnr()));
            }

            // Use decoded object if available, otherwise use raw data
            byte[] payload;
            if (msg.getObject() != null && !msg.getObject().isEmpty()) {
                payload = objectMapper.writeValueAsBytes(msg.getObject());
            } else if (msg.getData() != null) {
                // Base64 data — decode and wrap as raw
                byte[] decoded = Base64.getDecoder().decode(msg.getData());
                Map<String, Object> raw = new LinkedHashMap<>();
                raw.put("hexPayload", bytesToHex(decoded));
                raw.put("base64Payload", msg.getData());
                payload = objectMapper.writeValueAsBytes(raw);
            } else {
                payload = "{}".getBytes(StandardCharsets.UTF_8);
            }

            String topic = "/lorawan/uplink/" + (msg.getDevEui() != null ? msg.getDevEui() : "unknown");
            DeviceMessage deviceMessage = decode(topic, payload, headers);
            if (deviceMessage != null) {
                messageProducer.publishUpstream(deviceMessage);
                log.debug("LoRaWAN uplink published: devEui={}, fCnt={}", msg.getDevEui(), msg.getFCnt());
            }
        } catch (Exception e) {
            log.error("LoRaWAN uplink handling failed: devEui={}, error={}", msg.getDevEui(), e.getMessage());
        }
    }

    /**
     * 处理 Join 事件
     */
    public void handleJoin(LoRaWanMessage msg) {
        try {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("event", "join");
            data.put("devEui", msg.getDevEui());
            data.put("deviceName", msg.getDeviceName());
            data.put("time", msg.getTime());

            DeviceMessage deviceMessage = DeviceMessage.builder()
                    .messageId(UUID.randomUUID().toString())
                    .type(DeviceMessage.MessageType.DEVICE_ONLINE)
                    .topic("/lorawan/join/" + msg.getDevEui())
                    .payload(data)
                    .timestamp(System.currentTimeMillis())
                    .build();

            messageProducer.publishUpstream(deviceMessage);
            log.info("LoRaWAN device joined: devEui={}, name={}", msg.getDevEui(), msg.getDeviceName());
        } catch (Exception e) {
            log.error("LoRaWAN join handling failed: {}", e.getMessage());
        }
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
