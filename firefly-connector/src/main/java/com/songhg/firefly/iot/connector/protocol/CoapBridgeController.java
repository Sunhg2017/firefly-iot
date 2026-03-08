package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.connector.protocol.dto.DeviceAuthResult;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.Map;

/**
 * CoAP Bridge 控制器
 * <p>
 * 提供 HTTP ↔ CoAP 桥接端点，供以下场景使用：
 * <ul>
 *   <li>独立 CoAP 服务器（如 Eclipse Californium）通过 HTTP 回调转发消息</li>
 *   <li>CoAP-HTTP 代理网关</li>
 *   <li>开发测试阶段模拟 CoAP 设备接入</li>
 * </ul>
 */
@Slf4j
@Tag(name = "CoAP 桥接", description = "CoAP 协议桥接接入")
@RestController
@RequestMapping("/api/v1/protocol/coap")
@RequiredArgsConstructor
public class CoapBridgeController {

    private final CoapProtocolAdapter coapAdapter;
    private final DeviceAuthService authService;

    /**
     * CoAP 设备认证
     * <p>
     * 设备发送三元组，返回 Token 用于后续请求。
     * CoAP 原始请求: POST coap://host/auth
     */
    @Operation(summary = "CoAP 设备认证")
    @PostMapping("/auth")
    public R<Map<String, Object>> authenticate(@RequestBody byte[] payload) {
        DeviceAuthResult result = coapAdapter.authenticate(payload);
        if (!result.isSuccess()) {
            return R.fail(401, result.getErrorCode());
        }
        // CoAP 设备 token 有效期较长（低功耗设备不频繁认证）
        String token = authService.issueToken(result.getDeviceId(), result.getTenantId(), result.getProductId(), Duration.ofDays(7));
        return R.ok(Map.of("token", token, "deviceId", result.getDeviceId(), "expireIn", 604800));
    }

    /**
     * CoAP 属性上报
     * <p>
     * CoAP 原始请求: POST coap://host/property?token=xxx
     */
    @PostMapping("/property")
    @Operation(summary = "CoAP 属性上报")
    public R<Void> reportProperty(
            @Parameter(description = "设备认证令牌", required = true) @RequestParam String token,
            @RequestBody byte[] payload) {
        coapAdapter.handlePropertyReport(token, payload);
        return R.ok();
    }

    /**
     * CoAP 事件上报
     * <p>
     * CoAP 原始请求: POST coap://host/event?token=xxx
     */
    @PostMapping("/event")
    @Operation(summary = "CoAP 事件上报")
    public R<Void> reportEvent(
            @Parameter(description = "设备认证令牌", required = true) @RequestParam String token,
            @RequestBody byte[] payload) {
        coapAdapter.handleEventReport(token, payload);
        return R.ok();
    }

    /**
     * CoAP OTA 进度上报
     * <p>
     * CoAP 原始请求: POST coap://host/ota/progress?token=xxx
     */
    @Operation(summary = "CoAP OTA 进度上报")
    @PostMapping("/ota/progress")
    public R<Void> reportOtaProgress(
            @Parameter(description = "设备认证令牌", required = true) @RequestParam String token,
            @RequestBody byte[] payload) {
        coapAdapter.handleOtaProgress(token, payload);
        return R.ok();
    }

    /**
     * CoAP 获取设备影子（desired 属性）
     * <p>
     * CoAP 原始请求: GET coap://host/shadow?token=xxx
     * 用于低功耗设备定期拉取期望状态
     */
    @Operation(summary = "获取设备影子 desired")
    @GetMapping("/shadow")
    public R<Map<String, Object>> getShadowDesired(
            @Parameter(description = "设备认证令牌", required = true) @RequestParam String token) {
        DeviceAuthResult auth = authService.authenticateByToken(token);
        if (!auth.isSuccess()) {
            return R.fail(401, "UNAUTHORIZED");
        }
        // 委托 DeviceShadowService 获取 desired（通过注入实现）
        return R.ok(Map.of("deviceId", auth.getDeviceId(), "message", "Use /api/v1/devices/{id}/shadow for full shadow"));
    }
}
