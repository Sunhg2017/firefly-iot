package com.songhg.firefly.iot.media.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.media.dto.video.PtzControlDTO;
import com.songhg.firefly.iot.media.dto.video.RecordingVO;
import com.songhg.firefly.iot.media.dto.video.StreamSessionVO;
import com.songhg.firefly.iot.media.dto.video.StreamStartDTO;
import com.songhg.firefly.iot.media.dto.video.VideoChannelVO;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceCreateDTO;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceQueryDTO;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceUpdateDTO;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceVO;
import com.songhg.firefly.iot.media.service.VideoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Tag(name = "视频监控", description = "视频设备、通道、流会话、PTZ、录像")
@RestController
@RequestMapping("/api/v1/video")
@RequiredArgsConstructor
public class VideoController {

    private final VideoService videoService;

    // ==================== Video Device CRUD ====================

    @PostMapping("/devices")
    @RequiresPermission("video:create")
    @Operation(summary = "创建视频设备")
    public R<VideoDeviceVO> createDevice(@Valid @RequestBody VideoDeviceCreateDTO dto) {
        return R.ok(videoService.createDevice(dto));
    }

    @PostMapping("/devices/list")
    @RequiresPermission("video:read")
    @Operation(summary = "分页查询视频设备")
    public R<IPage<VideoDeviceVO>> listDevices(@RequestBody VideoDeviceQueryDTO query) {
        return R.ok(videoService.listDevices(query));
    }

    @GetMapping("/devices/{id}")
    @RequiresPermission("video:read")
    @Operation(summary = "获取视频设备详情")
    public R<VideoDeviceVO> getDevice(@Parameter(description = "视频设备编号", required = true) @PathVariable Long id) {
        return R.ok(videoService.getDeviceById(id));
    }

    @PutMapping("/devices/{id}")
    @RequiresPermission("video:update")
    @Operation(summary = "更新视频设备")
    public R<VideoDeviceVO> updateDevice(@Parameter(description = "视频设备编号", required = true) @PathVariable Long id, @Valid @RequestBody VideoDeviceUpdateDTO dto) {
        return R.ok(videoService.updateDevice(id, dto));
    }

    @DeleteMapping("/devices/{id}")
    @RequiresPermission("video:delete")
    @Operation(summary = "删除视频设备")
    public R<Void> deleteDevice(@Parameter(description = "视频设备编号", required = true) @PathVariable Long id) {
        videoService.deleteDevice(id);
        return R.ok();
    }

    // ==================== Channel Management ====================

    @GetMapping("/devices/{id}/channels")
    @RequiresPermission("video:read")
    @Operation(summary = "查询视频通道")
    public R<List<VideoChannelVO>> listChannels(@Parameter(description = "视频设备编号", required = true) @PathVariable Long id) {
        return R.ok(videoService.listChannels(id));
    }

    // ==================== GB28181 Queries ====================

    @PostMapping("/devices/{id}/catalog")
    @RequiresPermission("video:read")
    @Operation(summary = "查询 GB28181 目录")
    public R<Void> queryCatalog(@Parameter(description = "视频设备编号", required = true) @PathVariable Long id) {
        videoService.queryCatalog(id);
        return R.ok();
    }

    @PostMapping("/devices/{id}/device-info")
    @RequiresPermission("video:read")
    @Operation(summary = "查询 GB28181 设备信息")
    public R<Void> queryDeviceInfo(@Parameter(description = "视频设备编号", required = true) @PathVariable Long id) {
        videoService.queryDeviceInfo(id);
        return R.ok();
    }

    // ==================== Stream Control ====================

    @PostMapping("/devices/{id}/start")
    @RequiresPermission("video:stream")
    @Operation(summary = "开始推流")
    public R<StreamSessionVO> startStream(@Parameter(description = "视频设备编号", required = true) @PathVariable Long id, @RequestBody(required = false) StreamStartDTO dto) {
        if (dto == null) {
            dto = new StreamStartDTO();
        }
        return R.ok(videoService.startStream(id, dto));
    }

    @PostMapping("/devices/{id}/stop")
    @RequiresPermission("video:stream")
    @Operation(summary = "停止推流")
    public R<Void> stopStream(@Parameter(description = "视频设备编号", required = true) @PathVariable Long id) {
        videoService.stopStream(id);
        return R.ok();
    }

    @PostMapping("/devices/{id}/ptz")
    @RequiresPermission("video:ptz")
    @Operation(summary = "PTZ 云台控制")
    public R<Void> ptzControl(@Parameter(description = "视频设备编号", required = true) @PathVariable Long id, @Valid @RequestBody PtzControlDTO dto) {
        videoService.ptzControl(id, dto);
        return R.ok();
    }

    @Operation(summary = "拍照截图")
    @PostMapping("/devices/{id}/snapshot")
    @RequiresPermission("video:stream")
    public R<Map<String, String>> snapshot(@Parameter(description = "视频设备编号", required = true) @PathVariable Long id) {
        String url = videoService.snapshot(id);
        return R.ok(Map.of("imageUrl", url));
    }

    // ==================== Recording Control ====================

    @PostMapping("/devices/{id}/record/start")
    @RequiresPermission("video:record")
    @Operation(summary = "开始录制")
    public R<RecordingVO> startRecording(@Parameter(description = "视频设备编号", required = true) @PathVariable Long id) {
        return R.ok(videoService.startRecording(id));
    }

    @PostMapping("/devices/{id}/record/stop")
    @RequiresPermission("video:record")
    @Operation(summary = "停止录制")
    public R<RecordingVO> stopRecording(@Parameter(description = "视频设备编号", required = true) @PathVariable Long id) {
        return R.ok(videoService.stopRecording(id));
    }
}
