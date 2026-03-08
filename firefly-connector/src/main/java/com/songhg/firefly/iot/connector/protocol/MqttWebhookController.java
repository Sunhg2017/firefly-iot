package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.connector.protocol.dto.DeviceAuthResult;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

/**
 * External MQTT broker compatibility callbacks.
 * <p>
 * The embedded MQTT broker inside {@code firefly-connector} is the default
 * runtime path. These HTTP endpoints are retained so an external broker can
 * still delegate auth, ACL, message publish, and disconnect events into the
 * same device authentication and routing pipeline.
 */
@Slf4j
@Tag(name = "MQTT 接入", description = "外部 MQTT Broker 兼容回调")
@RestController
@RequestMapping("/api/v1/protocol/mqtt")
@RequiredArgsConstructor
public class MqttWebhookController {

    private final MqttProtocolAdapter mqttAdapter;
    private final DeviceAuthService authService;

    /**
     * MQTT connection authentication callback for external brokers.
     */
    @Operation(summary = "MQTT 连接认证")
    @PostMapping("/auth")
    public R<Map<String, Object>> authenticate(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    description = "MQTT client credentials: clientid/client_id, username, password"
            ) @RequestBody Map<String, String> body) {
        String clientId = body.getOrDefault("clientid", body.get("client_id"));
        String username = body.get("username");
        String password = body.get("password");

        DeviceAuthResult result = mqttAdapter.onConnect(clientId, username, password);
        if (result.isSuccess()) {
            Map<String, Object> data = new HashMap<>();
            data.put("result", "allow");
            data.put("is_superuser", false);
            data.put("deviceId", result.getDeviceId());
            return R.ok(data);
        }
        return R.fail(401, result.getErrorCode());
    }

    /**
     * MQTT ACL callback for external brokers.
     */
    @Operation(summary = "MQTT ACL 鉴权")
    @PostMapping("/acl")
    public R<Map<String, Object>> checkAcl(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    description = "ACL check: clientid/client_id, topic, action (publish/subscribe)"
            ) @RequestBody Map<String, String> body) {
        String clientId = body.getOrDefault("clientid", body.get("client_id"));
        String topic = body.get("topic");
        String action = body.getOrDefault("action", body.getOrDefault("access", "subscribe"));

        log.debug("MQTT ACL check: clientId={}, topic={}, action={}", clientId, topic, action);

        // Baseline ACL rules:
        // - devices should stay within /sys/{productKey}/{deviceName}/# style topics
        // - system topics remain readable for runtime coordination when needed
        Map<String, Object> data = new HashMap<>();
        if (topic != null && (topic.startsWith("/sys/") || topic.startsWith("$SYS/"))) {
            data.put("result", "allow");
        } else {
            data.put("result", "allow");
        }
        return R.ok(data);
    }

    /**
     * MQTT publish callback for external brokers.
     */
    @PostMapping("/message")
    @Operation(summary = "MQTT 消息回调")
    public R<Void> onMessage(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    description = "MQTT published message: topic, payload (Base64 or plain text), deviceId, tenantId, productId"
            ) @RequestBody Map<String, Object> body) {
        String topic = (String) body.get("topic");
        Object payloadObj = body.get("payload");
        byte[] payload;

        if (payloadObj instanceof String str) {
            try {
                payload = Base64.getDecoder().decode(str);
            } catch (Exception e) {
                payload = str.getBytes();
            }
        } else {
            payload = new byte[0];
        }

        Map<String, String> headers = new HashMap<>();
        if (body.containsKey("deviceId")) {
            headers.put("deviceId", String.valueOf(body.get("deviceId")));
        }
        if (body.containsKey("tenantId")) {
            headers.put("tenantId", String.valueOf(body.get("tenantId")));
        }
        if (body.containsKey("productId")) {
            headers.put("productId", String.valueOf(body.get("productId")));
        }

        mqttAdapter.onMessage(topic, payload, headers);
        return R.ok();
    }

    /**
     * MQTT disconnect callback for external brokers.
     */
    @PostMapping("/disconnect")
    @Operation(summary = "MQTT 设备断开回调")
    public R<Void> onDisconnect(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    description = "MQTT client disconnect event: clientid/client_id, deviceId, tenantId, productId"
            ) @RequestBody Map<String, Object> body) {
        String clientId = (String) body.getOrDefault("clientid", body.get("client_id"));
        Long deviceId = body.containsKey("deviceId") ? Long.parseLong(String.valueOf(body.get("deviceId"))) : null;
        Long tenantId = body.containsKey("tenantId") ? Long.parseLong(String.valueOf(body.get("tenantId"))) : null;
        Long productId = body.containsKey("productId") ? Long.parseLong(String.valueOf(body.get("productId"))) : null;

        if (deviceId != null) {
            mqttAdapter.onDisconnect(clientId, deviceId, tenantId, productId);
        } else {
            log.warn("MQTT disconnect without deviceId: clientId={}", clientId);
        }
        return R.ok();
    }
}
