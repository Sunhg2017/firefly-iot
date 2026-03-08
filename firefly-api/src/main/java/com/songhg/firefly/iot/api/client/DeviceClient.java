package com.songhg.firefly.iot.api.client;

import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

/**
 * 设备服务 Feign Client（供其他微服务调用）
 */
@FeignClient(name = "firefly-device", contextId = "deviceClient", path = "/api/v1/devices")
public interface DeviceClient {

    @GetMapping("/{id}/basic")
    R<DeviceBasicVO> getDeviceBasic(@PathVariable("id") Long id);

    @GetMapping("/batch-basic")
    R<List<DeviceBasicVO>> batchGetDeviceBasic(@RequestParam("ids") List<Long> ids);

    @GetMapping("/count")
    R<Long> countByProductId(@RequestParam("productId") Long productId);
}
