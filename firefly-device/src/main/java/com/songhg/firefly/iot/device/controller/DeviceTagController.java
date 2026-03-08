package com.songhg.firefly.iot.device.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.convert.DeviceTagConvert;
import com.songhg.firefly.iot.device.dto.devicetag.DeviceTagBindingVO;
import com.songhg.firefly.iot.device.dto.devicetag.DeviceTagCreateDTO;
import com.songhg.firefly.iot.device.dto.devicetag.DeviceTagQueryDTO;
import com.songhg.firefly.iot.device.dto.devicetag.DeviceTagUpdateDTO;
import com.songhg.firefly.iot.device.dto.devicetag.DeviceTagVO;
import com.songhg.firefly.iot.device.entity.DeviceTag;
import com.songhg.firefly.iot.device.service.DeviceTagService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "设备标签", description = "设备标签 CRUD、绑定管理")
@RestController
@RequestMapping("/api/v1/device-tags")
@RequiredArgsConstructor
public class DeviceTagController {

    private final DeviceTagService tagService;

    @PostMapping
    @RequiresPermission("device-tag:create")
    @Operation(summary = "创建标签")
    public R<DeviceTagVO> createTag(@Valid @RequestBody DeviceTagCreateDTO dto) {
        DeviceTag tag = tagService.createTag(dto.getTagKey(), dto.getTagValue(), dto.getColor(), dto.getDescription());
        return R.ok(DeviceTagConvert.INSTANCE.toVO(tag));
    }

    @PostMapping("/list")
    @RequiresPermission("device-tag:read")
    @Operation(summary = "查询标签列表")
    public R<IPage<DeviceTagVO>> listTags(
            @RequestBody DeviceTagQueryDTO query) {
        return R.ok(tagService.listTags(query).convert(DeviceTagConvert.INSTANCE::toVO));
    }

    @Operation(summary = "查询全部标签")
    @GetMapping("/all")
    @RequiresPermission("device-tag:read")
    public R<List<DeviceTagVO>> listAll() {
        return R.ok(tagService.listAll().stream().map(DeviceTagConvert.INSTANCE::toVO).toList());
    }

    @PutMapping("/{id}")
    @RequiresPermission("device-tag:update")
    @Operation(summary = "更新标签")
    public R<DeviceTagVO> updateTag(
            @Parameter(description = "标签编号", required = true) @PathVariable Long id,
            @Valid @RequestBody DeviceTagUpdateDTO dto) {
        DeviceTag tag = tagService.updateTag(id, dto.getTagValue(), dto.getColor(), dto.getDescription());
        return R.ok(DeviceTagConvert.INSTANCE.toVO(tag));
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("device-tag:delete")
    @Operation(summary = "删除标签")
    public R<Void> deleteTag(
            @Parameter(description = "标签编号", required = true) @PathVariable Long id) {
        tagService.deleteTag(id);
        return R.ok();
    }

    // ==================== Bindings ====================

    @GetMapping("/{id}/devices")
    @RequiresPermission("device-tag:read")
    @Operation(summary = "查询标签绑定")
    public R<List<DeviceTagBindingVO>> listBindings(
            @Parameter(description = "标签编号", required = true) @PathVariable Long id) {
        return R.ok(tagService.listBindings(id).stream()
                .map(DeviceTagConvert.INSTANCE::toBindingVO).toList());
    }

    @Operation(summary = "查询设备的标签")
    @GetMapping("/by-device/{deviceId}")
    @RequiresPermission("device-tag:read")
    public R<List<DeviceTagVO>> getDeviceTags(
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId) {
        return R.ok(tagService.getDeviceTags(deviceId).stream().map(DeviceTagConvert.INSTANCE::toVO).toList());
    }

    @Operation(summary = "绑定标签到设备")
    @PostMapping("/{id}/devices")
    @RequiresPermission("device-tag:update")
    public R<Void> bindTag(
            @Parameter(description = "标签编号", required = true) @PathVariable Long id,
            @Parameter(description = "设备编号", required = true) @RequestParam Long deviceId) {
        tagService.bindTag(id, deviceId);
        return R.ok();
    }

    @Operation(summary = "解绑标签")
    @DeleteMapping("/{id}/devices/{deviceId}")
    @RequiresPermission("device-tag:update")
    public R<Void> unbindTag(
            @Parameter(description = "标签编号", required = true) @PathVariable Long id,
            @Parameter(description = "设备编号", required = true) @PathVariable Long deviceId) {
        tagService.unbindTag(id, deviceId);
        return R.ok();
    }

    @Operation(summary = "批量绑定标签")
    @PostMapping("/{id}/devices/batch")
    @RequiresPermission("device-tag:update")
    public R<Void> batchBind(
            @Parameter(description = "标签编号", required = true) @PathVariable Long id,
            @RequestBody List<Long> deviceIds) {
        tagService.batchBindTag(id, deviceIds);
        return R.ok();
    }

    @Operation(summary = "批量解绑标签")
    @DeleteMapping("/{id}/devices/batch")
    @RequiresPermission("device-tag:update")
    public R<Void> batchUnbind(
            @Parameter(description = "标签编号", required = true) @PathVariable Long id,
            @RequestBody List<Long> deviceIds) {
        tagService.batchUnbindTag(id, deviceIds);
        return R.ok();
    }
}
