package com.songhg.firefly.iot.device.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.dto.device.BatchOperationResultVO;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchCommandDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchGroupDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchOperationDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchTagDTO;
import com.songhg.firefly.iot.device.service.DeviceBatchOperationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "设备批量操作", description = "设备批量启用/停用/删除/打标/分组/命令")
@RestController
@RequestMapping("/api/v1/devices")
@RequiredArgsConstructor
public class DeviceBatchController {

    private final DeviceBatchOperationService batchOperationService;

    @PostMapping("/batch-enable")
    @RequiresPermission("device:update")
    @Operation(summary = "批量启用设备")
    public R<BatchOperationResultVO> batchEnable(@Valid @RequestBody DeviceBatchOperationDTO dto) {
        return R.ok(batchOperationService.batchEnable(dto.getDeviceIds()));
    }

    @PostMapping("/batch-disable")
    @RequiresPermission("device:update")
    @Operation(summary = "批量停用设备")
    public R<BatchOperationResultVO> batchDisable(@Valid @RequestBody DeviceBatchOperationDTO dto) {
        return R.ok(batchOperationService.batchDisable(dto.getDeviceIds()));
    }

    @PostMapping("/batch-delete")
    @RequiresPermission("device:delete")
    @Operation(summary = "批量删除设备")
    public R<BatchOperationResultVO> batchDelete(@Valid @RequestBody DeviceBatchOperationDTO dto) {
        return R.ok(batchOperationService.batchDelete(dto.getDeviceIds()));
    }

    @PostMapping("/batch-tag")
    @RequiresPermission("device:update")
    @Operation(summary = "批量打标")
    public R<BatchOperationResultVO> batchTag(@Valid @RequestBody DeviceBatchTagDTO dto) {
        return R.ok(batchOperationService.batchTag(dto));
    }

    @PostMapping("/batch-group")
    @RequiresPermission("device:update")
    @Operation(summary = "批量调整分组")
    public R<BatchOperationResultVO> batchGroup(@Valid @RequestBody DeviceBatchGroupDTO dto) {
        return R.ok(batchOperationService.batchGroup(dto));
    }

    @PostMapping("/batch-command")
    @RequiresPermission("device:control")
    @Operation(summary = "批量下发命令")
    public R<BatchOperationResultVO> batchCommand(@Valid @RequestBody DeviceBatchCommandDTO dto) {
        return R.ok(batchOperationService.batchCommand(dto));
    }
}
