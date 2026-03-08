package com.songhg.firefly.iot.connector.parser.service;

import com.songhg.firefly.iot.api.client.DeviceLocatorClient;
import com.songhg.firefly.iot.api.dto.DeviceLocatorResolveDTO;
import com.songhg.firefly.iot.api.dto.DeviceLocatorResolveRequestDTO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.connector.parser.model.KnownDeviceContext;
import com.songhg.firefly.iot.connector.parser.model.ParseContext;
import com.songhg.firefly.iot.connector.parser.model.ParsedDeviceIdentity;
import com.songhg.firefly.iot.connector.parser.model.ResolvedDeviceContext;
import com.songhg.firefly.iot.connector.protocol.DeviceAuthService;
import com.songhg.firefly.iot.connector.protocol.dto.DeviceAuthResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Locale;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceIdentityResolveService {

    private final DeviceLocatorClient deviceLocatorClient;
    private final DeviceAuthService deviceAuthService;

    public ResolvedDeviceContext resolve(ParseContext parseContext,
                                         KnownDeviceContext knownDeviceContext,
                                         ParsedDeviceIdentity identity) {
        if (knownDeviceContext != null && knownDeviceContext.getDeviceId() != null) {
            return ResolvedDeviceContext.builder()
                    .tenantId(knownDeviceContext.getTenantId())
                    .productId(knownDeviceContext.getProductId())
                    .deviceId(knownDeviceContext.getDeviceId())
                    .deviceName(knownDeviceContext.getDeviceName())
                    .productKey(firstNotBlank(
                            knownDeviceContext.getProductKey(),
                            parseContext == null ? null : parseContext.getProductKey()))
                    .build();
        }

        if (identity == null) {
            return null;
        }

        String mode = upper(identity.getMode());
        if ("BY_DEVICE_NAME".equals(mode) || ("BY_LOCATOR".equals(mode) && "DEVICE_NAME".equals(upper(identity.getLocatorType())))) {
            String productKey = firstNotBlank(identity.getProductKey(), parseContext == null ? null : parseContext.getProductKey());
            String deviceName = firstNotBlank(identity.getDeviceName(), identity.getLocatorValue());
            if (productKey == null || deviceName == null) {
                return null;
            }
            return resolveByLocator(productKey, "DEVICE_NAME", deviceName, deviceName);
        }

        if (!"BY_LOCATOR".equals(mode)) {
            log.warn("Unsupported parsed identity mode: {}", identity.getMode());
            return null;
        }

        String productKey = firstNotBlank(identity.getProductKey(), parseContext == null ? null : parseContext.getProductKey());
        if (productKey == null || isBlank(identity.getLocatorType()) || isBlank(identity.getLocatorValue())) {
            return null;
        }

        return resolveByLocator(productKey, identity.getLocatorType(), identity.getLocatorValue(), identity.getDeviceName());
    }

    private ResolvedDeviceContext resolveByLocator(String productKey,
                                                   String locatorType,
                                                   String locatorValue,
                                                   String preferredDeviceName) {
        DeviceLocatorResolveRequestDTO request = new DeviceLocatorResolveRequestDTO();
        request.setProductKey(productKey);
        request.setLocatorType(locatorType);
        request.setLocatorValue(locatorValue);
        try {
            R<DeviceLocatorResolveDTO> response = deviceLocatorClient.resolveByLocator(request);
            DeviceLocatorResolveDTO data = response == null ? null : response.getData();
            if (data == null || !data.isSuccess()) {
                log.warn("Resolve device by locator failed: productKey={}, locatorType={}, error={}",
                        productKey, locatorType, data == null ? "RPC_ERROR" : data.getErrorCode());
                return null;
            }
            return ResolvedDeviceContext.builder()
                    .tenantId(data.getTenantId())
                    .productId(data.getProductId())
                    .deviceId(data.getDeviceId())
                    .deviceName(firstNotBlank(preferredDeviceName, data.getDeviceName()))
                    .productKey(productKey)
                    .build();
        } catch (Exception ex) {
            log.warn("Resolve device by locator RPC failed: productKey={}, locatorType={}, error={}",
                    productKey, locatorType, ex.getMessage());
            return null;
        }
    }

    private String upper(String value) {
        return value == null ? null : value.trim().toUpperCase(Locale.ROOT);
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private String firstNotBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}
