package com.songhg.firefly.iot.device.controller;

import com.songhg.firefly.iot.api.dto.DeviceTelemetryPointDTO;
import com.songhg.firefly.iot.api.dto.DeviceTelemetrySnapshotDTO;
import com.songhg.firefly.iot.api.dto.SharedDeviceTelemetryQueryDTO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.device.service.SharedDeviceReadService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "内部共享设备数据接口", description = "供规则服务读取共享设备实时与历史数据")
@RestController
@RequestMapping("/api/v1/internal/device-data")
@RequiredArgsConstructor
public class InternalDeviceDataController {

    private final SharedDeviceReadService sharedDeviceReadService;

    @GetMapping("/shared/{deviceId}/latest")
    @Operation(summary = "读取共享设备最新属性")
    public R<List<DeviceTelemetrySnapshotDTO>> querySharedLatest(@PathVariable Long deviceId,
                                                                 @RequestParam Long ownerTenantId) {
        return R.ok(sharedDeviceReadService.querySharedLatest(ownerTenantId, deviceId));
    }

    @PostMapping("/shared/query")
    @Operation(summary = "查询共享设备历史遥测")
    public R<List<DeviceTelemetryPointDTO>> querySharedTelemetry(@RequestBody SharedDeviceTelemetryQueryDTO dto) {
        return R.ok(sharedDeviceReadService.querySharedTelemetry(dto));
    }
}
