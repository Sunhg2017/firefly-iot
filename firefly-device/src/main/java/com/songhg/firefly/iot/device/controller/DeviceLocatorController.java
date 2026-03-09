package com.songhg.firefly.iot.device.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.dto.device.DeviceLocatorCreateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceLocatorUpdateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceLocatorVO;
import com.songhg.firefly.iot.device.protocolparser.service.DeviceLocatorService;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "Device Locators")
@RestController
@RequestMapping("/api/v1/devices/{deviceId}/locators")
@RequiredArgsConstructor
public class DeviceLocatorController {

    private final DeviceLocatorService deviceLocatorService;

    @GetMapping
    @RequiresPermission("device:read")
    public R<List<DeviceLocatorVO>> list(@PathVariable Long deviceId) {
        return R.ok(deviceLocatorService.listByDeviceId(deviceId));
    }

    @PostMapping
    @RequiresPermission("device:update")
    public R<DeviceLocatorVO> create(
            @Parameter(description = "deviceId", required = true) @PathVariable Long deviceId,
            @Valid @RequestBody DeviceLocatorCreateDTO dto) {
        return R.ok(deviceLocatorService.create(deviceId, dto));
    }

    @PutMapping("/{locatorId}")
    @RequiresPermission("device:update")
    public R<DeviceLocatorVO> update(
            @PathVariable Long deviceId,
            @PathVariable Long locatorId,
            @Valid @RequestBody DeviceLocatorUpdateDTO dto) {
        return R.ok(deviceLocatorService.update(deviceId, locatorId, dto));
    }

    @DeleteMapping("/{locatorId}")
    @RequiresPermission("device:update")
    public R<Void> delete(@PathVariable Long deviceId, @PathVariable Long locatorId) {
        deviceLocatorService.delete(deviceId, locatorId);
        return R.ok();
    }
}
