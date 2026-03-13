package com.songhg.firefly.iot.device.controller;

import com.songhg.firefly.iot.api.dto.DeviceAuthDTO;
import com.songhg.firefly.iot.api.dto.DeviceLocatorResolveDTO;
import com.songhg.firefly.iot.api.dto.DeviceLocatorResolveRequestDTO;
import com.songhg.firefly.iot.api.dto.DeviceRegisterDTO;
import com.songhg.firefly.iot.api.dto.DeviceRegisterRequestDTO;
import com.songhg.firefly.iot.api.dto.DeviceUnregisterDTO;
import com.songhg.firefly.iot.api.dto.DeviceUnregisterRequestDTO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.device.protocolparser.service.DeviceLocatorService;
import com.songhg.firefly.iot.device.service.DeviceCredentialService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.UUID;

/**
 * Internal device authentication API for firefly-connector Feign calls.
 */
@Tag(name = "内部设备认证", description = "供 Connector Feign 调用的设备认证接口")
@RestController
@RequestMapping("/api/v1/internal/device-auth")
@RequiredArgsConstructor
public class InternalDeviceAuthController {

    private final DeviceCredentialService credentialService;
    private final DeviceLocatorService deviceLocatorService;
    private final StringRedisTemplate redisTemplate;

    @GetMapping("/authenticate")
    @Operation(summary = "严格设备认证")
    public R<DeviceAuthDTO> authenticate(
            @Parameter(description = "产品标识", required = true) @RequestParam String productKey,
            @Parameter(description = "设备名称", required = true) @RequestParam String deviceName,
            @Parameter(description = "设备密钥", required = true) @RequestParam(required = false) String deviceSecret) {
        return R.ok(credentialService.authenticate(productKey, deviceName, deviceSecret));
    }

    @GetMapping("/session")
    @Operation(summary = "解析已认证设备会话")
    public R<DeviceAuthDTO> resolveSession(
            @Parameter(description = "产品标识", required = true) @RequestParam String productKey,
            @Parameter(description = "设备名称", required = true) @RequestParam String deviceName) {
        return R.ok(credentialService.resolveSession(productKey, deviceName));
    }

    @DeleteMapping("/session")
    @Operation(summary = "清理设备会话")
    public R<Void> clearSession(
            @Parameter(description = "产品标识", required = true) @RequestParam String productKey,
            @Parameter(description = "设备名称", required = true) @RequestParam String deviceName) {
        credentialService.clearSession(productKey, deviceName);
        return R.ok();
    }

    @PostMapping("/dynamic-register")
    @Operation(summary = "一型一密动态注册")
    public R<DeviceRegisterDTO> dynamicRegister(@RequestBody DeviceRegisterRequestDTO request) {
        return R.ok(credentialService.dynamicRegister(request));
    }

    @PostMapping("/dynamic-unregister")
    @Operation(summary = "一型一密动态注销")
    public R<DeviceUnregisterDTO> dynamicUnregister(@RequestBody DeviceUnregisterRequestDTO request) {
        return R.ok(credentialService.dynamicUnregister(request));
    }

    @GetMapping("/by-token")
    @Operation(summary = "Token 认证")
    public R<DeviceAuthDTO> authenticateByToken(
            @Parameter(description = "设备令牌", required = true) @RequestParam String token) {
        DeviceAuthDTO dto = new DeviceAuthDTO();
        String cacheKey = "device:token:" + token;
        String cached = redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            String[] parts = cached.split(":");
            if (parts.length >= 3) {
                dto.setSuccess(true);
                dto.setDeviceId(Long.parseLong(parts[0]));
                dto.setTenantId(Long.parseLong(parts[1]));
                dto.setProductId(Long.parseLong(parts[2]));
                return R.ok(dto);
            }
        }
        dto.setSuccess(false);
        dto.setErrorCode("INVALID_TOKEN");
        return R.ok(dto);
    }

    @GetMapping("/issue-token")
    @Operation(summary = "签发设备 Token")
    public R<String> issueToken(
            @Parameter(description = "设备编号", required = true) @RequestParam Long deviceId,
            @Parameter(description = "租户编号", required = true) @RequestParam Long tenantId,
            @Parameter(description = "产品编号", required = true) @RequestParam Long productId,
            @Parameter(description = "令牌有效期（秒）", required = true) @RequestParam long ttlSeconds) {
        String token = UUID.randomUUID().toString().replace("-", "");
        String cacheKey = "device:token:" + token;
        redisTemplate.opsForValue().set(cacheKey,
                deviceId + ":" + tenantId + ":" + productId, Duration.ofSeconds(ttlSeconds));
        return R.ok(token);
    }

    @PostMapping("/resolve-by-locator")
    @Operation(summary = "按定位器解析设备")
    public R<DeviceLocatorResolveDTO> resolveByLocator(@RequestBody DeviceLocatorResolveRequestDTO request) {
        return R.ok(deviceLocatorService.resolveByLocator(request));
    }
}
