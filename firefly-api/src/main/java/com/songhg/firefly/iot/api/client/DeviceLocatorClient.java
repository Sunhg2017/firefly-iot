package com.songhg.firefly.iot.api.client;

import com.songhg.firefly.iot.api.dto.DeviceLocatorResolveDTO;
import com.songhg.firefly.iot.api.dto.DeviceLocatorResolveRequestDTO;
import com.songhg.firefly.iot.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "firefly-device", contextId = "deviceLocatorClient", path = "/api/v1/internal/device-auth")
public interface DeviceLocatorClient {

    @PostMapping("/resolve-by-locator")
    R<DeviceLocatorResolveDTO> resolveByLocator(@RequestBody DeviceLocatorResolveRequestDTO request);
}
