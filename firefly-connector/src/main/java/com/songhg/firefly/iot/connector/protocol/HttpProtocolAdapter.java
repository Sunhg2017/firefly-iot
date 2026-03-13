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
        DeviceAuthResult auth = authService.authenticateByToken(token);
        if (!auth.isSuccess()) {
            return R.fail(401, "UNAUTHORIZED");
        }

        DeviceMessage message = DeviceMessage.builder()
                .tenantId(auth.getTenantId())
                .productId(auth.getProductId())
                .deviceId(auth.getDeviceId())
                .type(DeviceMessage.MessageType.EVENT_REPORT)
                .topic("/sys/http/" + auth.getDeviceId() + "/thing/event/post")
                .payload(event)
                .build();
        messageProducer.publishUpstream(message);
        return R.ok();
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

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}
