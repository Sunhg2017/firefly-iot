package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.api.dto.DeviceRegisterRequestDTO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.connector.protocol.dto.DeviceRegisterResult;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@Slf4j
@Tag(name = "设备动态注册", description = "一型一密动态注册入口")
@RestController
@RequestMapping("/api/v1/protocol/device")
@RequiredArgsConstructor
public class DeviceRegisterController {

    private final DeviceAuthService authService;

    @PostMapping("/register")
    @Operation(summary = "设备动态注册")
    public R<Map<String, Object>> register(@RequestBody DeviceRegisterRequestDTO request) {
        DeviceRegisterResult result = authService.dynamicRegister(request);
        if (!result.isSuccess()) {
            return R.fail(400, result.getErrorCode());
        }
        return R.ok(Map.of(
                "deviceId", result.getDeviceId(),
                "productId", result.getProductId(),
                "deviceName", result.getDeviceName(),
                "deviceSecret", result.getDeviceSecret()
        ));
    }
}
