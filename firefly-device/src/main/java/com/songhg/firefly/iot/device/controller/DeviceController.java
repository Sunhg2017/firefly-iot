package com.songhg.firefly.iot.device.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchCreateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceCreateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceCredentialVO;
import com.songhg.firefly.iot.device.dto.device.DeviceImportDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceQueryDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceTopologyQueryDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceTopologyVO;
import com.songhg.firefly.iot.device.dto.device.DeviceTripleExportDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceUpdateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceVO;
import com.songhg.firefly.iot.device.service.DeviceImportService;
import com.songhg.firefly.iot.device.service.DeviceService;
import io.swagger.v3.oas.annotations.Operation;
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

@Tag(name = "设备管理", description = "设备 CRUD、启用/禁用、批量注册、三元组导出")
@RestController
@RequestMapping("/api/v1/devices")
@RequiredArgsConstructor
public class DeviceController {

    private final DeviceService deviceService;
    private final DeviceImportService deviceImportService;

    @PostMapping
    @RequiresPermission("device:create")
    @Operation(summary = "创建设备")
    public R<DeviceCredentialVO> createDevice(@Valid @RequestBody DeviceCreateDTO dto) {
        return R.ok(deviceService.createDevice(dto));
    }

    @PostMapping("/batch")
    @RequiresPermission("device:create")
    @Operation(summary = "批量注册设备")
    public R<List<DeviceCredentialVO>> batchCreateDevices(@Valid @RequestBody DeviceBatchCreateDTO dto) {
        return R.ok(deviceService.batchCreateDevices(dto));
    }

    /**
     * 异步导入设备
     * <p>
     * 前端先将Excel/CSV文件上传到MinIO，然后传入fileKey注册异步导入任务。
     * 后端异步读取文件并解析、批量创建设备，任务进度可通过异步任务中心查询。
     */
    @PostMapping("/import")
    @RequiresPermission("device:create")
    @Operation(summary = "异步导入设备", description = "上传文件到MinIO后，传入fileKey注册异步导入任务")
    public R<Long> importDevices(@Valid @RequestBody DeviceImportDTO dto) {
        return R.ok(deviceImportService.registerImportTask(dto));
    }

    @PostMapping("/list")
    @RequiresPermission("device:read")
    @Operation(summary = "分页查询设备")
    public R<IPage<DeviceVO>> listDevices(@RequestBody DeviceQueryDTO query) {
        return R.ok(deviceService.listDevices(query));
    }

    @PostMapping("/topology")
    @RequiresPermission("device:read")
    @Operation(summary = "查询设备拓扑")
    public R<DeviceTopologyVO> getDeviceTopology(@RequestBody(required = false) DeviceTopologyQueryDTO query) {
        return R.ok(deviceService.getDeviceTopology(query));
    }

    @GetMapping("/{id}")
    @RequiresPermission("device:read")
    @Operation(summary = "获取设备详情")
    public R<DeviceVO> getDevice(@Parameter(description = "设备编号", required = true) @PathVariable Long id) {
        return R.ok(deviceService.getDeviceById(id));
    }

    @PutMapping("/{id}")
    @RequiresPermission("device:update")
    @Operation(summary = "更新设备")
    public R<DeviceVO> updateDevice(
            @Parameter(description = "设备编号", required = true) @PathVariable Long id,
            @Valid @RequestBody DeviceUpdateDTO dto
    ) {
        return R.ok(deviceService.updateDevice(id, dto));
    }

    @PutMapping("/{id}/enable")
    @RequiresPermission("device:update")
    @Operation(summary = "启用设备")
    public R<Void> enableDevice(@Parameter(description = "设备编号", required = true) @PathVariable Long id) {
        deviceService.enableDevice(id);
        return R.ok();
    }

    @PutMapping("/{id}/disable")
    @RequiresPermission("device:update")
    @Operation(summary = "禁用设备")
    public R<Void> disableDevice(@Parameter(description = "设备编号", required = true) @PathVariable Long id) {
        deviceService.disableDevice(id);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("device:delete")
    @Operation(summary = "删除设备")
    public R<Void> deleteDevice(@Parameter(description = "设备编号", required = true) @PathVariable Long id) {
        deviceService.deleteDevice(id);
        return R.ok();
    }

    @GetMapping("/{id}/secret")
    @RequiresPermission("device:read")
    @Operation(summary = "获取设备密钥")
    public R<String> getDeviceSecret(@Parameter(description = "设备编号", required = true) @PathVariable Long id) {
        return R.ok(deviceService.getDeviceSecret(id));
    }

    @PostMapping("/triples/export")
    @RequiresPermission("device:read")
    @Operation(summary = "批量导出设备三元组")
    public R<List<DeviceCredentialVO>> exportDeviceTriples(@RequestBody(required = false) DeviceTripleExportDTO dto) {
        return R.ok(deviceService.exportDeviceTriples(dto));
    }
}
