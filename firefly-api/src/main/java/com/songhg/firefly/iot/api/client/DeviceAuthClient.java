package com.songhg.firefly.iot.api.client;

import com.songhg.firefly.iot.api.dto.DeviceAuthDTO;
import com.songhg.firefly.iot.api.dto.DeviceLocatorResolveDTO;
import com.songhg.firefly.iot.api.dto.DeviceLocatorResolveRequestDTO;
import com.songhg.firefly.iot.api.dto.DeviceRegisterDTO;
import com.songhg.firefly.iot.api.dto.DeviceRegisterRequestDTO;
import com.songhg.firefly.iot.api.dto.DeviceUnregisterDTO;
import com.songhg.firefly.iot.api.dto.DeviceUnregisterRequestDTO;
import com.songhg.firefly.iot.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * 设备认证 Feign Client（供 firefly-connector 调用 firefly-device）
 */
@FeignClient(name = "firefly-device", contextId = "deviceAuthClient", path = "/api/v1/internal/device-auth")
public interface DeviceAuthClient {

    @GetMapping("/authenticate")
    R<DeviceAuthDTO> authenticate(@RequestParam("productKey") String productKey,
                                  @RequestParam("deviceName") String deviceName,
                                  @RequestParam(value = "deviceSecret", required = false) String deviceSecret);

    @GetMapping("/session")
    R<DeviceAuthDTO> resolveSession(@RequestParam("productKey") String productKey,
                                    @RequestParam("deviceName") String deviceName);

    @DeleteMapping("/session")
    R<Void> clearSession(@RequestParam("productKey") String productKey,
                         @RequestParam("deviceName") String deviceName);

    @PostMapping("/dynamic-register")
    R<DeviceRegisterDTO> dynamicRegister(@RequestBody DeviceRegisterRequestDTO request);

    @PostMapping("/dynamic-unregister")
    R<DeviceUnregisterDTO> dynamicUnregister(@RequestBody DeviceUnregisterRequestDTO request);

    @PostMapping("/resolve-by-locator")
    R<DeviceLocatorResolveDTO> resolveByLocator(@RequestBody DeviceLocatorResolveRequestDTO request);

    @GetMapping("/by-token")
    R<DeviceAuthDTO> authenticateByToken(@RequestParam("token") String token);

    @GetMapping("/issue-token")
    R<String> issueToken(@RequestParam("deviceId") Long deviceId,
                         @RequestParam("tenantId") Long tenantId,
                         @RequestParam("productId") Long productId,
                         @RequestParam("ttlSeconds") long ttlSeconds);
}
