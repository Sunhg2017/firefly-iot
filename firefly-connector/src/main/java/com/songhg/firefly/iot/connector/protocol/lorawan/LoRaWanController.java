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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * LoRaWAN management endpoints:
 * - webhook callbacks
 * - runtime device inspection
 * - simulated downlink queue
 */
@Slf4j
@Tag(name = "LoRaWAN Device Access", description = "LoRaWAN network server integration and downlink verification")
@RestController
@RequestMapping("/api/v1/lorawan")
@RequiredArgsConstructor
public class LoRaWanController {

    private final LoRaWanServer loRaWanServer;
    private final LoRaWanProperties properties;
    private final ObjectMapper objectMapper;

    // ==================== Webhook Callbacks ====================

    @Operation(summary = "Receive LoRaWAN uplink webhook")
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

    @Operation(summary = "Receive LoRaWAN join webhook")
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

    @Operation(summary = "Receive LoRaWAN ACK webhook")
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

    @Operation(summary = "Receive LoRaWAN status webhook")
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

    @Operation(summary = "Receive LoRaWAN error webhook")
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

    @Operation(summary = "List known LoRaWAN devices")
    @GetMapping("/devices")
    public R<Collection<LoRaWanDeviceInfo>> listDevices() {
        return R.ok(loRaWanServer.listDevices());
    }

    @Operation(summary = "Count known LoRaWAN devices")
    @GetMapping("/devices/count")
    public R<Integer> deviceCount() {
        return R.ok(loRaWanServer.getDeviceCount());
    }

    @Operation(summary = "Get a known LoRaWAN device")
    @GetMapping("/devices/{devEui}")
    public R<LoRaWanDeviceInfo> getDevice(
            @Parameter(description = "Unique device EUI", required = true, example = "0102030405060708")
            @PathVariable String devEui) {
        LoRaWanDeviceInfo info = loRaWanServer.getDevice(devEui);
        if (info == null) {
            return R.fail(404, "Device not found: " + devEui);
        }
        return R.ok(info);
    }

    // ==================== Downlink ====================

    @Operation(summary = "Queue a simulated LoRaWAN downlink")
    @PostMapping("/downlink")
    public R<Boolean> sendDownlink(@RequestBody DownlinkDTO dto) {
        if (!loRaWanServer.queueDownlink(dto.getDevEui(), dto.getFPort(), dto.getData(), dto.isConfirmed(), dto.getData(), null)) {
            return R.fail(404, "Device not found: " + dto.getDevEui());
        }
        return R.ok(true);
    }

    @Operation(summary = "List queued LoRaWAN downlinks")
    @GetMapping("/devices/{devEui}/downlinks")
    public R<List<LoRaWanServer.DownlinkRecord>> listDownlinks(
            @Parameter(description = "Unique device EUI", required = true, example = "0102030405060708")
            @PathVariable String devEui,
            @Parameter(description = "Only return records queued after this timestamp")
            @RequestParam(required = false) Long sinceTs) {
        return R.ok(loRaWanServer.listDownlinks(devEui, sinceTs));
    }

    // ==================== Stats ====================

    @Operation(summary = "Get LoRaWAN runtime statistics")
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

    @Operation(summary = "Get LoRaWAN configuration")
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

    @Data
    @Schema(description = "LoRaWAN downlink request")
    public static class DownlinkDTO {
        @Schema(description = "Target device EUI", example = "0102030405060708")
        private String devEui;

        @Schema(description = "Frame port", example = "1")
        private int fPort = 1;

        @Schema(description = "Payload data (plain text or Base64)", example = "eyJ0ZW1wIjoyNX0=")
        private String data;

        @Schema(description = "Whether the downlink is confirmed", example = "false")
        private boolean confirmed = false;
    }

    // ==================== Helpers ====================

    @SuppressWarnings("unchecked")
    private LoRaWanMessage parseWebhookBody(Map<String, Object> body, String eventType) {
        LoRaWanMessage msg = new LoRaWanMessage();
        msg.setEventType(eventType);

        Map<String, Object> deviceInfo = (Map<String, Object>) body.get("deviceInfo");
        if (deviceInfo != null) {
            msg.setDevEui((String) deviceInfo.get("devEui"));
            msg.setDeviceName((String) deviceInfo.get("deviceName"));
            msg.setApplicationId(String.valueOf(deviceInfo.getOrDefault("applicationId", "")));
            msg.setApplicationName((String) deviceInfo.get("applicationName"));
        }

        if (msg.getDevEui() == null) {
            msg.setDevEui((String) body.get("devEUI"));
            if (msg.getDevEui() == null) {
                msg.setDevEui((String) body.get("devEui"));
            }
        }
        if (msg.getDeviceName() == null) {
            msg.setDeviceName((String) body.get("deviceName"));
        }
        if (msg.getApplicationId() == null || msg.getApplicationId().isEmpty()) {
            msg.setApplicationId(String.valueOf(body.getOrDefault("applicationID", body.getOrDefault("applicationId", ""))));
        }

        msg.setFCnt(toLong(body.get("fCnt")));
        msg.setFPort(toInt(body.get("fPort")));
        msg.setData((String) body.get("data"));

        Object obj = body.get("object");
        if (obj instanceof Map) {
            msg.setObject((Map<String, Object>) obj);
        }

        Object rxInfoObj = body.get("rxInfo");
        if (rxInfoObj instanceof List) {
            try {
                String json = objectMapper.writeValueAsString(rxInfoObj);
                msg.setRxInfo(objectMapper.readValue(json, LoRaWanMessage.RxInfo[].class));
            } catch (Exception e) {
                log.debug("Failed to parse rxInfo: {}", e.getMessage());
            }
        }

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

    private long toLong(Object value) {
        if (value == null) {
            return 0L;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(value.toString());
        } catch (Exception ex) {
            return 0L;
        }
    }

    private int toInt(Object value) {
        if (value == null) {
            return 0;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(value.toString());
        } catch (Exception ex) {
            return 0;
        }
    }
}
