package com.songhg.firefly.iot.device.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.dto.video.DeviceVideoChannelVO;
import com.songhg.firefly.iot.device.dto.video.DeviceVideoCreateDTO;
import com.songhg.firefly.iot.device.dto.video.DeviceVideoQueryDTO;
import com.songhg.firefly.iot.device.dto.video.DeviceVideoUpdateDTO;
import com.songhg.firefly.iot.device.dto.video.DeviceVideoVO;
import com.songhg.firefly.iot.device.service.DeviceVideoService;
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

@Tag(name = "视频设备管理", description = "设备资产下的视频设备 CRUD 与通道查询")
@RestController
@RequestMapping("/api/v1/devices/video")
@RequiredArgsConstructor
public class DeviceVideoController {

    private final DeviceVideoService deviceVideoService;

    @PostMapping
    @RequiresPermission("device:create")
    @Operation(summary = "创建视频设备")
    public R<DeviceVideoVO> createDevice(@Valid @RequestBody DeviceVideoCreateDTO dto) {
        return R.ok(deviceVideoService.createVideoDevice(dto));
    }

    @PostMapping("/list")
    @RequiresPermission("device:read")
    @Operation(summary = "分页查询视频设备")
    public R<IPage<DeviceVideoVO>> listDevices(@RequestBody DeviceVideoQueryDTO query) {
        return R.ok(deviceVideoService.listVideoDevices(query));
    }

    @GetMapping("/{deviceId}")
    @RequiresPermission("device:read")
    @Operation(summary = "获取视频设备详情")
    public R<DeviceVideoVO> getDevice(@Parameter(description = "设备资产编号", required = true) @PathVariable Long deviceId) {
        return R.ok(deviceVideoService.getVideoDevice(deviceId));
    }

    @PutMapping("/{deviceId}")
    @RequiresPermission("device:update")
    @Operation(summary = "更新视频设备")
    public R<DeviceVideoVO> updateDevice(@PathVariable Long deviceId, @Valid @RequestBody DeviceVideoUpdateDTO dto) {
        return R.ok(deviceVideoService.updateVideoDevice(deviceId, dto));
    }

    @DeleteMapping("/{deviceId}")
    @RequiresPermission("device:delete")
    @Operation(summary = "删除视频设备")
    public R<Void> deleteDevice(@PathVariable Long deviceId) {
        deviceVideoService.deleteVideoDevice(deviceId);
        return R.ok();
    }

    @GetMapping("/{deviceId}/channels")
    @RequiresPermission("device:read")
    @Operation(summary = "查询视频通道")
    public R<List<DeviceVideoChannelVO>> listChannels(@PathVariable Long deviceId) {
        return R.ok(deviceVideoService.listChannels(deviceId));
    }
}
