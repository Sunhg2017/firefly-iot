package com.songhg.firefly.iot.media.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.media.dto.video.PtzControlDTO;
import com.songhg.firefly.iot.media.dto.video.RecordingVO;
import com.songhg.firefly.iot.media.dto.video.StreamSessionVO;
import com.songhg.firefly.iot.media.dto.video.StreamStartDTO;
import com.songhg.firefly.iot.media.dto.video.VideoRecordingVO;
import com.songhg.firefly.iot.media.service.RecordingService;
import com.songhg.firefly.iot.media.service.VideoService;
import com.songhg.firefly.iot.media.zlm.ZlmMp4RecordDownload;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.InputStream;
import java.util.List;
import java.util.Map;

@Tag(name = "视频控制", description = "视频设备目录、设备信息、播放、PTZ、截图与录像控制")
@RestController
@RequestMapping("/api/v1/video")
@RequiredArgsConstructor
public class VideoController {

    private final VideoService videoService;
    private final RecordingService recordingService;

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

    @GetMapping("/devices/{deviceId}/recordings")
    @RequiresPermission("video:read")
    @Operation(summary = "录像检索")
    public R<List<VideoRecordingVO>> listRecordings(
            @Parameter(description = "设备资产编号", required = true) @PathVariable Long deviceId) {
        return R.ok(recordingService.listRecordings(deviceId));
    }

    @GetMapping("/devices/{deviceId}/recordings/play")
    @RequiresPermission("video:record")
    @Operation(summary = "历史回放（流式返回录像 MP4）")
    public ResponseEntity<StreamingResponseBody> playRecording(
            @Parameter(description = "设备资产编号", required = true) @PathVariable Long deviceId,
            @Parameter(description = "录像文件名", required = true) @RequestParam String fileName,
            @Parameter(description = "录像开始时间（epoch 毫秒）", required = true) @RequestParam long startTime) {
        ZlmMp4RecordDownload download = recordingService.openRecordingStream(deviceId, fileName, startTime);
        return streamResponse(download, MediaType.parseMediaType("video/mp4"),
                ContentDisposition.inline().filename(sanitizeFileName(fileName)).build());
    }

    @GetMapping("/devices/{deviceId}/recordings/download")
    @RequiresPermission("video:record")
    @Operation(summary = "录像下载（流式返回录像 MP4）")
    public ResponseEntity<StreamingResponseBody> downloadRecording(
            @Parameter(description = "设备资产编号", required = true) @PathVariable Long deviceId,
            @Parameter(description = "录像文件名", required = true) @RequestParam String fileName,
            @Parameter(description = "录像开始时间（epoch 毫秒）", required = true) @RequestParam long startTime) {
        ZlmMp4RecordDownload download = recordingService.openRecordingStream(deviceId, fileName, startTime);
        return streamResponse(download, MediaType.APPLICATION_OCTET_STREAM,
                ContentDisposition.attachment().filename(sanitizeFileName(fileName)).build());
    }

    private ResponseEntity<StreamingResponseBody> streamResponse(
            ZlmMp4RecordDownload download, MediaType contentType, ContentDisposition disposition) {
        InputStream body = download.body();
        StreamingResponseBody streamingBody = outputStream -> {
            try (body; outputStream) {
                body.transferTo(outputStream);
            }
        };
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(contentType);
        headers.setContentDisposition(disposition);
        if (download.contentLength() > 0) {
            headers.setContentLength(download.contentLength());
        }
        return ResponseEntity.ok().headers(headers).body(streamingBody);
    }

    private String sanitizeFileName(String fileName) {
        if (fileName == null) {
            return "recording.mp4";
        }
        return fileName.replaceAll("[\\\\/\r\n\"']", "_");
    }
}
