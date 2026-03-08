package com.songhg.firefly.iot.device.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.convert.FirmwareConvert;
import com.songhg.firefly.iot.device.dto.firmware.DeviceFirmwareBatchBindDTO;
import com.songhg.firefly.iot.device.dto.firmware.DeviceFirmwareBindDTO;
import com.songhg.firefly.iot.device.dto.firmware.DeviceFirmwareQueryDTO;
import com.songhg.firefly.iot.device.dto.firmware.DeviceFirmwareStatusDTO;
import com.songhg.firefly.iot.device.dto.firmware.DeviceFirmwareVO;
import com.songhg.firefly.iot.device.service.DeviceFirmwareService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "设备固件", description = "设备固件绑定管理")
@RestController
@RequestMapping("/api/v1/device-firmwares")
@RequiredArgsConstructor
public class DeviceFirmwareController {

    private final DeviceFirmwareService deviceFirmwareService;

    @GetMapping("/{deviceId}")
    @RequiresPermission("device:read")
    @Operation(summary = "获取设备固件信息")
    public R<DeviceFirmwareVO> getDeviceFirmware(
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId) {
        return R.ok(FirmwareConvert.INSTANCE.toDeviceFirmwareVO(deviceFirmwareService.getDeviceFirmware(deviceId)));
    }

    @Operation(summary = "按固件查询绑定设备")
    @PostMapping("/by-firmware/{firmwareId}/list")
    @RequiresPermission("firmware:read")
    public R<IPage<DeviceFirmwareVO>> listByFirmware(
            @Parameter(description = "固件编号", required = true) @PathVariable Long firmwareId,
            @RequestBody DeviceFirmwareQueryDTO query) {
        return R.ok(deviceFirmwareService.listByFirmware(firmwareId, query)
                .convert(FirmwareConvert.INSTANCE::toDeviceFirmwareVO));
    }

    @Operation(summary = "按版本查询设备固件")
    @GetMapping("/by-version")
    @RequiresPermission("firmware:read")
    public R<List<DeviceFirmwareVO>> listByVersion(
            @Parameter(description = "固件版本", required = true) @RequestParam String version) {
        return R.ok(deviceFirmwareService.listByVersion(version).stream()
                .map(FirmwareConvert.INSTANCE::toDeviceFirmwareVO).toList());
    }

    @PostMapping("/bind")
    @RequiresPermission("firmware:update")
    @Operation(summary = "绑定固件")
    public R<DeviceFirmwareVO> bindFirmware(@Valid @RequestBody DeviceFirmwareBindDTO dto) {
        return R.ok(FirmwareConvert.INSTANCE.toDeviceFirmwareVO(
                deviceFirmwareService.bindFirmware(dto.getDeviceId(), dto.getFirmwareId(), dto.getVersion())));
    }

    @Operation(summary = "批量绑定固件")
    @PostMapping("/batch-bind")
    @RequiresPermission("firmware:update")
    public R<Void> batchBindFirmware(@Valid @RequestBody DeviceFirmwareBatchBindDTO dto) {
        deviceFirmwareService.batchBindFirmware(dto.getDeviceIds(), dto.getFirmwareId(), dto.getVersion());
        return R.ok();
    }

    @Operation(summary = "更新升级状态")
    @PutMapping("/{deviceId}/status")
    @RequiresPermission("firmware:update")
    public R<Void> updateUpgradeStatus(
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId,
            @Valid @RequestBody DeviceFirmwareStatusDTO dto) {
        deviceFirmwareService.updateUpgradeStatus(deviceId, dto.getStatus(), dto.getProgress(), dto.getTargetVersion());
        return R.ok();
    }
}
