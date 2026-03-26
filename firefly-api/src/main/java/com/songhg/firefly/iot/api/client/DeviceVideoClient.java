package com.songhg.firefly.iot.api.client;

import com.songhg.firefly.iot.api.dto.InternalVideoChannelVO;
import com.songhg.firefly.iot.api.dto.InternalVideoDeviceVO;
import com.songhg.firefly.iot.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

/**
 * 视频设备内部读取接口（供 firefly-media 调用）。
 */
@FeignClient(name = "firefly-device", contextId = "deviceVideoClient", path = "/api/v1/internal/device-videos")
public interface DeviceVideoClient {

    @GetMapping("/{deviceId}")
    R<InternalVideoDeviceVO> getVideoDevice(@PathVariable("deviceId") Long deviceId);

    @GetMapping("/{deviceId}/channels")
    R<List<InternalVideoChannelVO>> listChannels(@PathVariable("deviceId") Long deviceId);

    @GetMapping("/gb-identity")
    R<InternalVideoDeviceVO> getByGbIdentity(@RequestParam("gbDeviceId") String gbDeviceId,
                                             @RequestParam(value = "gbDomain", required = false) String gbDomain);
}
