package com.songhg.firefly.iot.device.controller;

import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.api.dto.InternalDeviceCreateDTO;
import com.songhg.firefly.iot.api.dto.SharedDeviceResolveRequestDTO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.device.service.DeviceService;
import com.songhg.firefly.iot.device.service.SharedDeviceReadService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Internal device read APIs for service-to-service calls.
 */
@Tag(name = "内部设备接口", description = "供其他微服务读取设备基础信息")
@RestController
@RequestMapping("/api/v1/internal/devices")
@RequiredArgsConstructor
public class InternalDeviceController {

    private final DeviceService deviceService;
    private final SharedDeviceReadService sharedDeviceReadService;

    @PostMapping
    @Operation(summary = "内部创建设备")
    public R<DeviceBasicVO> createDevice(@Valid @RequestBody InternalDeviceCreateDTO dto) {
        return R.ok(deviceService.createDeviceFromInternal(dto));
    }

    @GetMapping("/{id}/basic")
    @Operation(summary = "获取设备基础信息")
    public R<DeviceBasicVO> getDeviceBasic(@PathVariable Long id) {
        return R.ok(deviceService.getDeviceBasic(id));
    }

    @GetMapping("/batch-basic")
    @Operation(summary = "批量获取设备基础信息")
    public R<List<DeviceBasicVO>> batchGetDeviceBasic(@RequestParam("ids") List<Long> ids) {
        return R.ok(deviceService.batchGetDeviceBasic(ids));
    }

    @GetMapping("/count")
    @Operation(summary = "统计产品下设备数量")
    public R<Long> countByProductId(@RequestParam("productId") Long productId) {
        return R.ok(deviceService.countByProductId(productId));
    }

    @PostMapping("/shared/resolve")
    @Operation(summary = "根据共享范围解析设备")
    public R<List<DeviceBasicVO>> resolveSharedDevices(@RequestBody SharedDeviceResolveRequestDTO dto) {
        return R.ok(sharedDeviceReadService.resolveSharedDevices(dto));
    }
}
