package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.connector.parser.model.KnownDeviceContext;
import com.songhg.firefly.iot.connector.parser.model.ProtocolParseOutcome;
import com.songhg.firefly.iot.connector.parser.service.ProtocolParseEngine;
import com.songhg.firefly.iot.connector.protocol.dto.DeviceAuthResult;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * HTTP 协议适配器 — 设备通过 HTTP 上报数据
 */
@Slf4j
@Tag(name = "HTTP 接入", description = "HTTP 协议设备数据接入")
@RestController
@RequestMapping("/api/v1/protocol/http")
@RequiredArgsConstructor
public class HttpProtocolAdapter {

    private final DeviceAuthService authService;
    private final DeviceMessageProducer messageProducer;
    private final MessageCodec messageCodec;
    private final ProtocolParseEngine protocolParseEngine;
    private final HttpDeviceLifecycleService lifecycleService;

    /**
     * 设备认证 + 获取 Token
     */
    @Operation(summary = "设备认证并获取 Token")
    @PostMapping("/auth")
    public R<Map<String, Object>> authenticate(@RequestBody(required = false) Map<String, String> body,
                                               @RequestParam(required = false) String productKey,
                                               @RequestParam(required = false) String deviceName,
                                               @RequestParam(required = false) String deviceSecret) {
        if (body != null) {
            productKey = firstNonBlank(productKey, body.get("productKey"));
            deviceName = firstNonBlank(deviceName, body.get("deviceName"));
            deviceSecret = firstNonBlank(deviceSecret, body.get("deviceSecret"));
        }

        DeviceAuthResult result = authService.authenticate(productKey, deviceName, deviceSecret);
        if (!result.isSuccess()) {
            return R.fail(401, result.getErrorCode());
        }

        String token = authService.issueToken(result.getDeviceId(), result.getTenantId(), result.getProductId(), Duration.ofHours(24));
        if (token == null || token.isBlank()) {
            log.error("HTTP device token issue failed: deviceId={}, tenantId={}, productId={}",
                    result.getDeviceId(), result.getTenantId(), result.getProductId());
            return R.fail(500, "TOKEN_ISSUE_FAILED");
        }
        return R.ok(Map.of("token", token, "deviceId", result.getDeviceId(), "expireIn", 86400));
    }

    /**
     * 上报属性数据
     */
    @Operation(summary = "上报属性数据")
    @PostMapping("/property/post")
    public R<Void> reportProperty(@RequestHeader("X-Device-Token") String token, @RequestBody Map<String, Object> properties) {
        DeviceAuthResult auth = authService.authenticateByToken(token);
        if (!auth.isSuccess()) {
            return R.fail(401, "UNAUTHORIZED");
        }
        lifecycleService.markActive(auth, "property");

        DeviceMessage message = DeviceMessage.builder()
                .tenantId(auth.getTenantId())
                .productId(auth.getProductId())
                .deviceId(auth.getDeviceId())
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .topic("/sys/http/" + auth.getDeviceId() + "/thing/property/post")
                .payload(properties)
                .build();
        messageProducer.publishUpstream(message);
        return R.ok();
    }

    /**
     * 上报事件
     */
    @Operation(summary = "上报事件")
    @PostMapping("/event/post")
    public R<Void> reportEvent(@RequestHeader("X-Device-Token") String token, @RequestBody Map<String, Object> event) {
        DeviceAuthResult auth = authenticateToken(token);
        if (!auth.isSuccess()) {
            return R.fail(401, "UNAUTHORIZED");
        }
        String lifecycleIdentifier = extractLifecycleIdentifier(event);
        if (lifecycleIdentifier != null) {
            return handleLifecycleEvent(auth, lifecycleIdentifier, event);
        }
        lifecycleService.markActive(auth, "event");
        messageProducer.publishUpstream(buildHttpMessage(
                auth,
                DeviceMessage.MessageType.EVENT_REPORT,
                "/thing/event/post",
                event
        ));
        return R.ok();
    }

    @Operation(summary = "HTTP 设备上线")
    @PostMapping("/online")
    public R<Void> online(@RequestHeader("X-Device-Token") String token,
                          @RequestBody(required = false) Map<String, Object> event) {
        DeviceAuthResult auth = authenticateToken(token);
        if (!auth.isSuccess()) {
            return R.fail(401, "UNAUTHORIZED");
        }
        return handleLifecycleEvent(auth, "online", event);
    }

    @Operation(summary = "HTTP 设备离线")
    @PostMapping("/offline")
    public R<Void> offline(@RequestHeader("X-Device-Token") String token,
                           @RequestBody(required = false) Map<String, Object> event) {
        DeviceAuthResult auth = authenticateToken(token);
        if (!auth.isSuccess()) {
            return R.fail(401, "UNAUTHORIZED");
        }
        return handleLifecycleEvent(auth, "offline", event);
    }

    /**
     * 通用数据上报（由 topic 路径决定消息类型）
     */
    @Operation(summary = "通用数据上报")
    @PostMapping("/data/{action}")
    public R<Void> reportData(@RequestHeader("X-Device-Token") String token,
                              @PathVariable String action,
                              @RequestBody byte[] payload) {
        DeviceAuthResult auth = authService.authenticateByToken(token);
        if (!auth.isSuccess()) {
            return R.fail(401, "UNAUTHORIZED");
        }
        lifecycleService.markActive(auth, "data:" + action);

        String topic = "/sys/http/" + auth.getDeviceId() + "/thing/" + action;
        ProtocolParseOutcome parseOutcome = protocolParseEngine.parse(
                ProtocolParseEngine.buildContext(
                        "HTTP",
                        "HTTP",
                        topic,
                        payload,
                        Map.of("action", action),
                        null,
                        null,
                        auth.getProductId(),
                        null
                ),
                KnownDeviceContext.builder()
                        .tenantId(auth.getTenantId())
                        .productId(auth.getProductId())
                        .deviceId(auth.getDeviceId())
                        .build()
        );
        if (parseOutcome.isHandled()) {
            parseOutcome.getMessages().forEach(messageProducer::publishUpstream);
            return R.ok();
        }

        DeviceMessage message = messageCodec.decodeJson(topic, payload, auth.getDeviceId(), auth.getTenantId(), auth.getProductId());
        if (message != null) {
            messageProducer.publishUpstream(message);
        }
        return R.ok();
    }

    @Operation(summary = "HTTP 设备心跳")
    @PostMapping("/heartbeat")
    public R<Void> heartbeat(@RequestHeader("X-Device-Token") String token,
                             @RequestBody(required = false) Map<String, Object> event) {
        DeviceAuthResult auth = authenticateToken(token);
        if (!auth.isSuccess()) {
            return R.fail(401, "UNAUTHORIZED");
        }
        return handleLifecycleEvent(auth, "heartbeat", event);
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private DeviceAuthResult authenticateToken(String token) {
        return authService.authenticateByToken(token);
    }

    private R<Void> handleLifecycleEvent(DeviceAuthResult auth,
                                         String identifier,
                                         Map<String, Object> event) {
        if ("offline".equals(identifier)) {
            lifecycleService.markOffline(auth, resolveOfflineReason(event));
        } else {
            lifecycleService.markActive(auth, identifier);
        }
        messageProducer.publishUpstream(buildHttpMessage(
                auth,
                DeviceMessage.MessageType.EVENT_REPORT,
                "/thing/event/post",
                buildLifecycleEventPayload(identifier, event)
        ));
        return R.ok();
    }

    private String extractLifecycleIdentifier(Map<String, Object> event) {
        if (event == null || event.isEmpty()) {
            return null;
        }
        String identifier = firstNonBlank(asText(event.get("identifier")), asText(event.get("eventType")));
        if ("online".equals(identifier) || "offline".equals(identifier) || "heartbeat".equals(identifier)) {
            return identifier;
        }
        return null;
    }

    private String resolveOfflineReason(Map<String, Object> event) {
        return firstNonBlank(asText(event == null ? null : event.get("reason")), "client_offline");
    }

    private String asText(Object value) {
        if (value == null) {
            return null;
        }
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }

    private Map<String, Object> buildLifecycleEventPayload(String identifier, Map<String, Object> event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        if (event != null && !event.isEmpty()) {
            payload.putAll(event);
        }
        payload.putIfAbsent("identifier", identifier);
        payload.putIfAbsent("eventType", identifier);
        payload.putIfAbsent("protocol", "HTTP");
        payload.putIfAbsent("timestamp", System.currentTimeMillis());
        return payload;
    }

    private DeviceMessage buildHttpMessage(DeviceAuthResult auth,
                                           DeviceMessage.MessageType type,
                                           String topicSuffix,
                                           Map<String, Object> payload) {
        return DeviceMessage.builder()
                .tenantId(auth.getTenantId())
                .productId(auth.getProductId())
                .deviceId(auth.getDeviceId())
                .type(type)
                .topic("/sys/http/" + auth.getDeviceId() + topicSuffix)
                .payload(payload)
                .build();
    }
}
