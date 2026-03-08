package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.api.client.DeviceAuthClient;
import com.songhg.firefly.iot.api.dto.DeviceAuthDTO;
import com.songhg.firefly.iot.api.dto.DeviceRegisterDTO;
import com.songhg.firefly.iot.api.dto.DeviceRegisterRequestDTO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.connector.protocol.dto.DeviceAuthResult;
import com.songhg.firefly.iot.connector.protocol.dto.DeviceRegisterResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceAuthService {

    private final DeviceAuthClient deviceAuthClient;

    public DeviceAuthResult authenticate(String productKey, String deviceName, String deviceSecret) {
        try {
            R<DeviceAuthDTO> resp = deviceAuthClient.authenticate(productKey, deviceName, deviceSecret);
            return toAuthResult(resp);
        } catch (Exception e) {
            log.error("Device auth RPC failed: {}", e.getMessage(), e);
            return DeviceAuthResult.fail("RPC_ERROR");
        }
    }

    public DeviceAuthResult resolveSession(String productKey, String deviceName) {
        try {
            R<DeviceAuthDTO> resp = deviceAuthClient.resolveSession(productKey, deviceName);
            return toAuthResult(resp);
        } catch (Exception e) {
            log.error("Resolve device session RPC failed: {}", e.getMessage(), e);
            return DeviceAuthResult.fail("RPC_ERROR");
        }
    }

    public void clearSession(String productKey, String deviceName) {
        try {
            deviceAuthClient.clearSession(productKey, deviceName);
        } catch (Exception e) {
            log.warn("Clear device session RPC failed: {}", e.getMessage(), e);
        }
    }

    public DeviceRegisterResult dynamicRegister(DeviceRegisterRequestDTO request) {
        try {
            R<DeviceRegisterDTO> resp = deviceAuthClient.dynamicRegister(request);
            if (resp == null || resp.getData() == null) {
                return DeviceRegisterResult.fail("RPC_ERROR");
            }
            DeviceRegisterDTO dto = resp.getData();
            if (dto.isSuccess()) {
                return DeviceRegisterResult.success(
                        dto.getDeviceId(),
                        dto.getTenantId(),
                        dto.getProductId(),
                        dto.getDeviceName(),
                        dto.getDeviceSecret()
                );
            }
            return DeviceRegisterResult.fail(dto.getErrorCode());
        } catch (Exception e) {
            log.error("Device register RPC failed: {}", e.getMessage(), e);
            return DeviceRegisterResult.fail("RPC_ERROR");
        }
    }

    public DeviceAuthResult authenticateByToken(String token) {
        try {
            R<DeviceAuthDTO> resp = deviceAuthClient.authenticateByToken(token);
            return toAuthResult(resp);
        } catch (Exception e) {
            log.error("Token auth RPC failed: {}", e.getMessage(), e);
            return DeviceAuthResult.fail("RPC_ERROR");
        }
    }

    public String issueToken(Long deviceId, Long tenantId, Long productId, Duration ttl) {
        try {
            R<String> resp = deviceAuthClient.issueToken(deviceId, tenantId, productId, ttl.toSeconds());
            if (resp != null && resp.getData() != null) {
                return resp.getData();
            }
        } catch (Exception e) {
            log.error("Issue token RPC failed: {}", e.getMessage(), e);
        }
        return null;
    }

    public void invalidateCache(String productKey, String deviceName) {
        clearSession(productKey, deviceName);
    }

    private DeviceAuthResult toAuthResult(R<DeviceAuthDTO> resp) {
        if (resp == null || resp.getData() == null) {
            return DeviceAuthResult.fail("RPC_ERROR");
        }
        DeviceAuthDTO dto = resp.getData();
        if (dto.isSuccess()) {
            return DeviceAuthResult.success(dto.getDeviceId(), dto.getTenantId(), dto.getProductId());
        }
        return DeviceAuthResult.fail(dto.getErrorCode());
    }
}
