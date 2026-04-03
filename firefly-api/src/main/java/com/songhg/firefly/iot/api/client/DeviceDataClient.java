package com.songhg.firefly.iot.api.client;

import com.songhg.firefly.iot.api.dto.DeviceTelemetryPointDTO;
import com.songhg.firefly.iot.api.dto.DeviceTelemetrySnapshotDTO;
import com.songhg.firefly.iot.api.dto.SharedDeviceTelemetryQueryDTO;
import com.songhg.firefly.iot.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

@FeignClient(name = "firefly-device", contextId = "deviceDataClient", path = "/api/v1/internal/device-data")
public interface DeviceDataClient {

    @GetMapping("/shared/{deviceId}/latest")
    R<List<DeviceTelemetrySnapshotDTO>> querySharedLatest(@PathVariable("deviceId") Long deviceId,
                                                          @RequestParam("ownerTenantId") Long ownerTenantId);

    @PostMapping("/shared/query")
    R<List<DeviceTelemetryPointDTO>> querySharedTelemetry(@RequestBody SharedDeviceTelemetryQueryDTO dto);
}
