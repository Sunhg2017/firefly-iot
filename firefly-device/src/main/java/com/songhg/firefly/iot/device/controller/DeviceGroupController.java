package com.songhg.firefly.iot.device.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.convert.DeviceGroupConvert;
import com.songhg.firefly.iot.device.dto.devicegroup.DeviceGroupCreateDTO;
import com.songhg.firefly.iot.device.dto.devicegroup.DeviceGroupMemberVO;
import com.songhg.firefly.iot.device.dto.devicegroup.DeviceGroupQueryDTO;
import com.songhg.firefly.iot.device.dto.devicegroup.DeviceGroupUpdateDTO;
import com.songhg.firefly.iot.device.dto.devicegroup.DeviceGroupVO;
import com.songhg.firefly.iot.device.entity.DeviceGroup;
import com.songhg.firefly.iot.device.service.DeviceGroupService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "设备分组", description = "设备分组 CRUD、成员管理")
@RestController
@RequestMapping("/api/v1/device-groups")
@RequiredArgsConstructor
public class DeviceGroupController {

    private final DeviceGroupService groupService;

    @PostMapping
    @RequiresPermission("device-group:create")
    @Operation(summary = "创建设备分组")
    public R<DeviceGroupVO> createGroup(@Valid @RequestBody DeviceGroupCreateDTO dto) {
        DeviceGroup group = groupService.createGroup(dto.getName(), dto.getDescription(), dto.getType(), dto.getDynamicRule(), dto.getParentId());
        return R.ok(DeviceGroupConvert.INSTANCE.toVO(group));
    }

    @GetMapping("/{id}")
    @RequiresPermission("device-group:read")
    @Operation(summary = "获取分组详情")
    public R<DeviceGroupVO> getGroup(
            @Parameter(description = "分组编号", required = true) @PathVariable Long id) {
        return R.ok(DeviceGroupConvert.INSTANCE.toVO(groupService.getGroup(id)));
    }

    @PostMapping("/list")
    @RequiresPermission("device-group:read")
    @Operation(summary = "查询分组列表")
    public R<IPage<DeviceGroupVO>> listGroups(
            @RequestBody DeviceGroupQueryDTO query) {
        return R.ok(groupService.listGroups(query).convert(DeviceGroupConvert.INSTANCE::toVO));
    }

    @Operation(summary = "查询全部分组")
    @GetMapping("/all")
    @RequiresPermission("device-group:read")
    public R<List<DeviceGroupVO>> listAll() {
        return R.ok(groupService.listAll().stream().map(DeviceGroupConvert.INSTANCE::toVO).toList());
    }

    @Operation(summary = "查询分组树")
    @GetMapping("/tree")
    @RequiresPermission("device-group:read")
    public R<List<DeviceGroupVO>> getTree() {
        return R.ok(groupService.getTree());
    }

    @PutMapping("/{id}")
    @RequiresPermission("device-group:update")
    @Operation(summary = "更新分组")
    public R<DeviceGroupVO> updateGroup(
            @Parameter(description = "分组编号", required = true) @PathVariable Long id,
            @Valid @RequestBody DeviceGroupUpdateDTO dto) {
        DeviceGroup group = groupService.updateGroup(
                id,
                dto.getName(),
                dto.getDescription(),
                dto.getType(),
                dto.getDynamicRule(),
                dto.getParentId()
        );
        return R.ok(DeviceGroupConvert.INSTANCE.toVO(group));
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("device-group:delete")
    @Operation(summary = "删除分组")
    public R<Void> deleteGroup(
            @Parameter(description = "分组编号", required = true) @PathVariable Long id) {
        groupService.deleteGroup(id);
        return R.ok();
    }

    // ==================== Members ====================

    @Operation(summary = "查询分组成员")
    @GetMapping("/{id}/devices")
    @RequiresPermission("device-group:read")
    public R<List<DeviceGroupMemberVO>> listDevices(
            @Parameter(description = "分组编号", required = true) @PathVariable Long id) {
        return R.ok(groupService.listMemberDetails(id));
    }

    @Operation(summary = "添加分组成员")
    @PostMapping("/{id}/devices")
    @RequiresPermission("device-group:update")
    public R<Void> addDevice(
            @Parameter(description = "分组编号", required = true) @PathVariable Long id,
            @Parameter(description = "待添加设备编号", required = true) @RequestParam Long deviceId) {
        groupService.addDevice(id, deviceId);
        return R.ok();
    }

    @Operation(summary = "移除分组成员")
    @DeleteMapping("/{id}/devices/{deviceId}")
    @RequiresPermission("device-group:update")
    public R<Void> removeDevice(
            @Parameter(description = "分组编号", required = true) @PathVariable Long id,
            @Parameter(description = "待移除设备编号", required = true) @PathVariable Long deviceId) {
        groupService.removeDevice(id, deviceId);
        return R.ok();
    }

    @Operation(summary = "批量添加分组成员")
    @PostMapping("/{id}/devices/batch")
    @RequiresPermission("device-group:update")
    public R<Void> batchAddDevices(
            @Parameter(description = "分组编号", required = true) @PathVariable Long id,
            @RequestBody List<Long> deviceIds) {
        groupService.batchAddDevices(id, deviceIds);
        return R.ok();
    }

    @Operation(summary = "批量移除分组成员")
    @DeleteMapping("/{id}/devices/batch")
    @RequiresPermission("device-group:update")
    public R<Void> batchRemoveDevices(
            @Parameter(description = "分组编号", required = true) @PathVariable Long id,
            @RequestBody List<Long> deviceIds) {
        groupService.batchRemoveDevices(id, deviceIds);
        return R.ok();
    }
}
