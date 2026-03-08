package com.songhg.firefly.iot.connector.protocol.lorawan;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.connector.config.LoRaWanProperties;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * LoRaWAN 管理接口 — Webhook 回调、设备管理、下行消息、统计
 */
@Slf4j
@Tag(name = "LoRaWAN 设备接入", description = "LoRaWAN 网络服务器集成、Webhook 回调、下行消息推送")
@RestController
@RequestMapping("/api/v1/lorawan")
@RequiredArgsConstructor
public class LoRaWanController {

    private final LoRaWanServer loRaWanServer;
    private final LoRaWanProperties properties;
    private final ObjectMapper objectMapper;

    // ==================== Webhook Callbacks ====================

    @Operation(summary = "接收 LoRaWAN 上行数据 (ChirpStack/TTN webhook)")
    @PostMapping("/webhook/up")
    public R<Boolean> webhookUplink(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    description = "ChirpStack v4 / TTN v3 uplink webhook JSON body"
            ) @RequestBody Map<String, Object> body) {
        try {
            LoRaWanMessage msg = parseWebhookBody(body, "up");
            loRaWanServer.handleUplinkEvent(msg);
            return R.ok(true);
        } catch (Exception e) {
            log.error("Webhook uplink error: {}", e.getMessage());
            return R.ok(false);
        }
    }

    @Operation(summary = "接收 LoRaWAN Join 事件")
    @PostMapping("/webhook/join")
    public R<Boolean> webhookJoin(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    description = "LoRaWAN join event webhook JSON body"
            ) @RequestBody Map<String, Object> body) {
        try {
            LoRaWanMessage msg = parseWebhookBody(body, "join");
            loRaWanServer.handleJoinEvent(msg);
            return R.ok(true);
        } catch (Exception e) {
            log.error("Webhook join error: {}", e.getMessage());
            return R.ok(false);
        }
    }

    @Operation(summary = "接收 LoRaWAN ACK 事件")
    @PostMapping("/webhook/ack")
    public R<Boolean> webhookAck(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    description = "LoRaWAN downlink ACK webhook JSON body"
            ) @RequestBody Map<String, Object> body) {
        try {
            LoRaWanMessage msg = parseWebhookBody(body, "ack");
            loRaWanServer.handleAckEvent(msg);
            return R.ok(true);
        } catch (Exception e) {
            log.error("Webhook ack error: {}", e.getMessage());
            return R.ok(false);
        }
    }

    @Operation(summary = "接收 LoRaWAN 状态事件")
    @PostMapping("/webhook/status")
    public R<Boolean> webhookStatus(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    description = "LoRaWAN device status webhook JSON body"
            ) @RequestBody Map<String, Object> body) {
        try {
            LoRaWanMessage msg = parseWebhookBody(body, "status");
            loRaWanServer.handleStatusEvent(msg);
            return R.ok(true);
        } catch (Exception e) {
            log.error("Webhook status error: {}", e.getMessage());
            return R.ok(false);
        }
    }

    @Operation(summary = "接收 LoRaWAN 错误事件")
    @PostMapping("/webhook/error")
    public R<Boolean> webhookError(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    description = "LoRaWAN error event webhook JSON body"
            ) @RequestBody Map<String, Object> body) {
        try {
            LoRaWanMessage msg = parseWebhookBody(body, "error");
            loRaWanServer.handleErrorEvent(msg);
            return R.ok(true);
        } catch (Exception e) {
            log.error("Webhook error event error: {}", e.getMessage());
            return R.ok(false);
        }
    }

    // ==================== Device Management ====================

    @Operation(summary = "查看 LoRaWAN 已知设备列表")
    @GetMapping("/devices")
    public R<Collection<LoRaWanDeviceInfo>> listDevices() {
        return R.ok(loRaWanServer.listDevices());
    }

    @Operation(summary = "查看 LoRaWAN 设备数量")
    @GetMapping("/devices/count")
    public R<Integer> deviceCount() {
        return R.ok(loRaWanServer.getDeviceCount());
    }

    @Operation(summary = "查看指定设备详情")
    @GetMapping("/devices/{devEui}")
    public R<LoRaWanDeviceInfo> getDevice(
            @Parameter(description = "设备唯一标识", required = true, example = "0102030405060708")
            @PathVariable String devEui) {
        LoRaWanDeviceInfo info = loRaWanServer.getDevice(devEui);
        if (info == null) {
            return R.fail(404, "设备不存在: " + devEui);
        }
        return R.ok(info);
    }

    // ==================== Downlink ====================

    @Operation(summary = "发送下行消息 (模拟)")
    @PostMapping("/downlink")
    public R<Boolean> sendDownlink(@RequestBody DownlinkDTO dto) {
        LoRaWanDeviceInfo info = loRaWanServer.getDevice(dto.getDevEui());
        if (info == null) {
            return R.fail(404, "设备不存在: " + dto.getDevEui());
        }
        info.getDownlinkCount().incrementAndGet();
        info.setLastDownlinkTime(System.currentTimeMillis());
        log.info("LoRaWAN downlink queued: devEui={}, fPort={}, data={}", dto.getDevEui(), dto.getFPort(), dto.getData());
        return R.ok(true);
    }

    // ==================== Stats ====================

    @Operation(summary = "查看 LoRaWAN 综合统计")
    @GetMapping("/stats")
    public R<Map<String, Object>> stats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("enabled", properties.isEnabled());
        stats.put("networkServer", properties.getNetworkServer());
        stats.put("deviceCount", loRaWanServer.getDeviceCount());
        stats.put("totalUplinks", loRaWanServer.getTotalUplinks());
        stats.put("totalDownlinks", loRaWanServer.getTotalDownlinks());
        stats.put("payloadCodec", properties.getPayloadCodec());
        return R.ok(stats);
    }

    @Operation(summary = "查看 LoRaWAN 配置")
    @GetMapping("/config")
    public R<Map<String, Object>> config() {
        Map<String, Object> cfg = new LinkedHashMap<>();
        cfg.put("enabled", properties.isEnabled());
        cfg.put("networkServer", properties.getNetworkServer());
        cfg.put("apiUrl", properties.getApiUrl());
        cfg.put("webhookPath", properties.getWebhookPath());
        cfg.put("payloadCodec", properties.getPayloadCodec());
        cfg.put("applicationId", properties.getApplicationId());
        cfg.put("downlinkClass", properties.getDownlinkClass());
        cfg.put("downlinkFPort", properties.getDownlinkFPort());
        cfg.put("downlinkConfirmed", properties.isDownlinkConfirmed());
        cfg.put("deduplicationWindowMs", properties.getDeduplicationWindowMs());
        return R.ok(cfg);
    }

    // ==================== DTOs ====================

    /**
     * Downlink message request DTO.
     */
    @Data
    @Schema(description = "下行消息请求")
    public static class DownlinkDTO {
        /** Target device EUI (hex string, 16 chars, e.g. "0102030405060708") */
        @Schema(description = "目标设备唯一标识", example = "0102030405060708")
        private String devEui;

        /** LoRaWAN frame port (1-255, default 1) */
        @Schema(description = "帧端口", example = "1")
        private int fPort = 1;

        /** Payload data (Base64 encoded or plain text) */
        @Schema(description = "负载数据", example = "eyJ0ZW1wIjoyNX0=")
        private String data;

        /** Whether to request downlink confirmation from the device */
        @Schema(description = "是否需要确认", example = "false")
        private boolean confirmed = false;
    }

    // ==================== Helpers ====================

    @SuppressWarnings("unchecked")
    private LoRaWanMessage parseWebhookBody(Map<String, Object> body, String eventType) {
        LoRaWanMessage msg = new LoRaWanMessage();
        msg.setEventType(eventType);

        // ChirpStack v4 format
        Map<String, Object> deviceInfo = (Map<String, Object>) body.get("deviceInfo");
        if (deviceInfo != null) {
            msg.setDevEui((String) deviceInfo.get("devEui"));
            msg.setDeviceName((String) deviceInfo.get("deviceName"));
            msg.setApplicationId(String.valueOf(deviceInfo.getOrDefault("applicationId", "")));
            msg.setApplicationName((String) deviceInfo.get("applicationName"));
        }

        // Direct fields (TTN / simplified)
        if (msg.getDevEui() == null) {
            msg.setDevEui((String) body.get("devEUI"));
            if (msg.getDevEui() == null) msg.setDevEui((String) body.get("devEui"));
        }
        if (msg.getDeviceName() == null) {
            msg.setDeviceName((String) body.get("deviceName"));
        }
        if (msg.getApplicationId() == null || msg.getApplicationId().isEmpty()) {
            msg.setApplicationId(String.valueOf(body.getOrDefault("applicationID", body.getOrDefault("applicationId", ""))));
        }

        // fCnt, fPort
        msg.setFCnt(toLong(body.get("fCnt")));
        msg.setFPort(toInt(body.get("fPort")));

        // data
        msg.setData((String) body.get("data"));

        // object (decoded payload)
        Object obj = body.get("object");
        if (obj instanceof Map) {
            msg.setObject((Map<String, Object>) obj);
        }

        // rxInfo
        Object rxInfoObj = body.get("rxInfo");
        if (rxInfoObj instanceof List) {
            try {
                String json = objectMapper.writeValueAsString(rxInfoObj);
                msg.setRxInfo(objectMapper.readValue(json, LoRaWanMessage.RxInfo[].class));
            } catch (Exception e) {
                log.debug("Failed to parse rxInfo: {}", e.getMessage());
            }
        }

        // txInfo
        Object txInfoObj = body.get("txInfo");
        if (txInfoObj instanceof Map) {
            try {
                String json = objectMapper.writeValueAsString(txInfoObj);
                msg.setTxInfo(objectMapper.readValue(json, LoRaWanMessage.TxInfo.class));
            } catch (Exception e) {
                log.debug("Failed to parse txInfo: {}", e.getMessage());
            }
        }

        msg.setDeduplicationId((String) body.get("deduplicationId"));
        msg.setTime((String) body.get("time"));

        return msg;
    }

    private long toLong(Object v) {
        if (v == null) return 0;
        if (v instanceof Number) return ((Number) v).longValue();
        try { return Long.parseLong(v.toString()); } catch (Exception e) { return 0; }
    }

    private int toInt(Object v) {
        if (v == null) return 0;
        if (v instanceof Number) return ((Number) v).intValue();
        try { return Integer.parseInt(v.toString()); } catch (Exception e) { return 0; }
    }
}
