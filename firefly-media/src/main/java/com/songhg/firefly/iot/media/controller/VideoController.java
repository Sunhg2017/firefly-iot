package com.songhg.firefly.iot.media.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.media.dto.video.PtzControlDTO;
import com.songhg.firefly.iot.media.dto.video.RecordingVO;
import com.songhg.firefly.iot.media.dto.video.StreamSessionVO;
import com.songhg.firefly.iot.media.dto.video.StreamStartDTO;
import com.songhg.firefly.iot.media.service.VideoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@Tag(name = "视频控制", description = "视频设备目录、设备信息、播放、PTZ、截图与录像控制")
@RestController
@RequestMapping("/api/v1/video")
@RequiredArgsConstructor
public class VideoController {

    private final VideoService videoService;

    @PostMapping("/devices/{deviceId}/catalog")
    @RequiresPermission("video:read")
    @Operation(summary = "查询 GB28181 目录")
    public R<Void> queryCatalog(@Parameter(description = "设备资产编号", required = true) @PathVariable Long deviceId) {
        videoService.queryCatalog(deviceId);
        return R.ok();
    }

    @PostMapping("/devices/{deviceId}/device-info")
    @RequiresPermission("video:read")
    @Operation(summary = "查询 GB28181 设备信息")
    public R<Void> queryDeviceInfo(@Parameter(description = "设备资产编号", required = true) @PathVariable Long deviceId) {
        videoService.queryDeviceInfo(deviceId);
        return R.ok();
    }

    @PostMapping("/devices/{deviceId}/start")
    @RequiresPermission("video:stream")
    @Operation(summary = "开始推流")
    public R<StreamSessionVO> startStream(@Parameter(description = "设备资产编号", required = true) @PathVariable Long deviceId,
                                          @RequestBody(required = false) StreamStartDTO dto) {
        return R.ok(videoService.startStream(deviceId, dto == null ? new StreamStartDTO() : dto));
    }

    @PostMapping("/devices/{deviceId}/stop")
    @RequiresPermission("video:stream")
    @Operation(summary = "停止推流")
    public R<Void> stopStream(@Parameter(description = "设备资产编号", required = true) @PathVariable Long deviceId) {
        videoService.stopStream(deviceId);
        return R.ok();
    }

    @PostMapping("/devices/{deviceId}/ptz")
    @RequiresPermission("video:ptz")
    @Operation(summary = "PTZ 云台控制")
    public R<Void> ptzControl(@Parameter(description = "设备资产编号", required = true) @PathVariable Long deviceId,
                              @Valid @RequestBody PtzControlDTO dto) {
        videoService.ptzControl(deviceId, dto);
        return R.ok();
    }

    @PostMapping("/devices/{deviceId}/snapshot")
    @RequiresPermission("video:stream")
    @Operation(summary = "拍照截图")
    public R<Map<String, String>> snapshot(@Parameter(description = "设备资产编号", required = true) @PathVariable Long deviceId) {
        return R.ok(Map.of("imageUrl", videoService.snapshot(deviceId)));
    }

    @PostMapping("/devices/{deviceId}/record/start")
    @RequiresPermission("video:record")
    @Operation(summary = "开始录制")
    public R<RecordingVO> startRecording(@Parameter(description = "设备资产编号", required = true) @PathVariable Long deviceId) {
        return R.ok(videoService.startRecording(deviceId));
    }

    @PostMapping("/devices/{deviceId}/record/stop")
    @RequiresPermission("video:record")
    @Operation(summary = "停止录制")
    public R<RecordingVO> stopRecording(@Parameter(description = "设备资产编号", required = true) @PathVariable Long deviceId) {
        return R.ok(videoService.stopRecording(deviceId));
    }
}
