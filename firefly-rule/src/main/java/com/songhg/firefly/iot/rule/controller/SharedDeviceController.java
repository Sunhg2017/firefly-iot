package com.songhg.firefly.iot.rule.controller;

import com.songhg.firefly.iot.api.dto.DeviceTelemetryPointDTO;
import com.songhg.firefly.iot.api.dto.DeviceTelemetrySnapshotDTO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.rule.dto.share.SharedDeviceVO;
import com.songhg.firefly.iot.rule.service.SharedDeviceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "共享数据读取", description = "消费方按已批准策略读取共享设备与遥测")
@RestController
@RequestMapping("/api/v1/shared")
@RequiredArgsConstructor
public class SharedDeviceController {

    private final SharedDeviceService sharedDeviceService;

    @GetMapping("/devices")
    @RequiresPermission("share:read")
    @Operation(summary = "查询共享设备列表")
    public R<List<SharedDeviceVO>> listSharedDevices(@RequestParam(required = false) Long policyId,
                                                     HttpServletRequest request) {
        return R.ok(sharedDeviceService.listSharedDevices(policyId, resolveClientIp(request)));
    }

    @GetMapping("/devices/{deviceId}/properties")
    @RequiresPermission("share:read")
    @Operation(summary = "查询共享设备最新属性")
    public R<List<DeviceTelemetrySnapshotDTO>> querySharedLatest(
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId,
            @Parameter(description = "共享策略编号", required = true) @RequestParam Long policyId,
            HttpServletRequest request) {
        return R.ok(sharedDeviceService.querySharedLatest(policyId, deviceId, resolveClientIp(request)));
    }

    @GetMapping("/devices/{deviceId}/telemetry")
    @RequiresPermission("share:read")
    @Operation(summary = "查询共享设备历史遥测")
    public R<List<DeviceTelemetryPointDTO>> querySharedTelemetry(
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId,
            @Parameter(description = "共享策略编号", required = true) @RequestParam Long policyId,
            @RequestParam(required = false) String property,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(required = false) Integer limit,
            HttpServletRequest request) {
        return R.ok(sharedDeviceService.querySharedTelemetry(
                policyId,
                deviceId,
                property,
                startTime,
                endTime,
                limit,
                resolveClientIp(request)
        ));
    }

    private String resolveClientIp(HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            int separator = forwardedFor.indexOf(',');
            return (separator >= 0 ? forwardedFor.substring(0, separator) : forwardedFor).trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }
}
