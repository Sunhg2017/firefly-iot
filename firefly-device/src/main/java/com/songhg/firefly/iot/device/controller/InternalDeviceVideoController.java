package com.songhg.firefly.iot.device.controller;

import com.songhg.firefly.iot.api.dto.InternalVideoChannelVO;
import com.songhg.firefly.iot.api.dto.InternalVideoDeviceVO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.device.service.DeviceVideoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "内部视频设备接口", description = "供 firefly-media 读取视频设备主数据")
@RestController
@RequestMapping("/api/v1/internal/device-videos")
@RequiredArgsConstructor
public class InternalDeviceVideoController {

    private final DeviceVideoService deviceVideoService;

    @GetMapping("/{deviceId}")
    @Operation(summary = "按设备资产编号获取视频设备")
    public R<InternalVideoDeviceVO> getVideoDevice(@PathVariable Long deviceId) {
        return R.ok(deviceVideoService.getInternalVideoDevice(deviceId));
    }

    @GetMapping("/{deviceId}/channels")
    @Operation(summary = "按设备资产编号获取视频通道")
    public R<List<InternalVideoChannelVO>> listChannels(@PathVariable Long deviceId) {
        return R.ok(deviceVideoService.listInternalChannels(deviceId));
    }

    @GetMapping("/gb-identity")
    @Operation(summary = "按 GB 设备身份读取视频设备")
    public R<InternalVideoDeviceVO> getByGbIdentity(@RequestParam("gbDeviceId") String gbDeviceId,
                                                    @RequestParam(value = "gbDomain", required = false) String gbDomain) {
        return R.ok(deviceVideoService.getInternalVideoDeviceByGbIdentity(gbDeviceId, gbDomain));
    }
}
