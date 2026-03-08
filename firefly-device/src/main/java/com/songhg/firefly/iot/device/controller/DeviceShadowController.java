package com.songhg.firefly.iot.device.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.dto.device.DeviceShadowDTO;
import com.songhg.firefly.iot.device.service.DeviceShadowService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Tag(name = "设备影子", description = "设备影子读写")
@RestController
@RequestMapping("/api/v1/devices")
@RequiredArgsConstructor
public class DeviceShadowController {

    private final DeviceShadowService shadowService;

    @GetMapping("/{deviceId}/shadow")
    @RequiresPermission("device:read")
    @Operation(summary = "获取设备影子")
    public R<DeviceShadowDTO> getShadow(
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId) {
        return R.ok(shadowService.getShadow(deviceId));
    }

    @PutMapping("/{deviceId}/shadow/desired")
    @RequiresPermission("device:update")
    @Operation(summary = "更新 desired 期望值")
    public R<DeviceShadowDTO> updateDesired(
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId,
            @RequestBody Map<String, Object> desired) {
        return R.ok(shadowService.updateDesired(deviceId, desired));
    }

    @Operation(summary = "更新 reported 状态")
    @PutMapping("/{deviceId}/shadow/reported")
    @RequiresPermission("device:update")
    public R<DeviceShadowDTO> updateReported(
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId,
            @RequestBody Map<String, Object> reported) {
        return R.ok(shadowService.updateReported(deviceId, reported));
    }

    @Operation(summary = "获取 delta 差异")
    @GetMapping("/{deviceId}/shadow/delta")
    @RequiresPermission("device:read")
    public R<Map<String, Object>> getDelta(
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId) {
        return R.ok(shadowService.getDelta(deviceId));
    }

    @Operation(summary = "删除设备影子")
    @DeleteMapping("/{deviceId}/shadow")
    @RequiresPermission("device:delete")
    public R<Void> deleteShadow(
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId) {
        shadowService.deleteShadow(deviceId);
        return R.ok();
    }

    @DeleteMapping("/{deviceId}/shadow/desired")
    @RequiresPermission("device:update")
    @Operation(summary = "清除 desired 期望值")
    public R<DeviceShadowDTO> clearDesired(
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId) {
        return R.ok(shadowService.clearDesired(deviceId));
    }
}
