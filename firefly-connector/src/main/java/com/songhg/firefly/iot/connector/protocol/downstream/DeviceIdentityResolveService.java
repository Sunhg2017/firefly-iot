package com.songhg.firefly.iot.connector.protocol.downstream;

import com.songhg.firefly.iot.api.client.DeviceClient;
import com.songhg.firefly.iot.api.client.DeviceLocatorClient;
import com.songhg.firefly.iot.api.client.ProductClient;
import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.api.dto.DeviceLocatorInputDTO;
import com.songhg.firefly.iot.api.dto.DeviceLocatorResolveDTO;
import com.songhg.firefly.iot.api.dto.DeviceLocatorResolveRequestDTO;
import com.songhg.firefly.iot.api.dto.ProductBasicVO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.connector.protocol.lorawan.LoRaWanDeviceInfo;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service("downstreamDeviceIdentityResolveService")
@RequiredArgsConstructor
public class DeviceIdentityResolveService {

    private static final List<String> LORAWAN_LOCATOR_TYPES = List.of(
            "DEV_EUI",
            "DEVEUI",
            "LORAWAN_DEVEUI",
            "EUI64",
            "EUI"
    );

    private final DeviceClient deviceClient;
    private final ProductClient productClient;
    private final DeviceLocatorClient deviceLocatorClient;

    /**
     * Cache the successful deviceId -> devEui match so repeated LoRaWAN downlinks
     * do not need to walk the locator resolution flow every time.
     */
    private final Map<Long, String> loRaDevEuiCache = new ConcurrentHashMap<>();

    public ResolvedDeviceIdentity loadByDeviceId(Long deviceId) {
        if (deviceId == null) {
            return null;
        }

        DeviceBasicVO device = loadDeviceBasic(deviceId);
        if (device == null || device.getId() == null) {
            return null;
        }

        ProductBasicVO product = loadProductBasic(device.getProductId());
        return ResolvedDeviceIdentity.builder()
                .deviceId(device.getId())
                .tenantId(device.getTenantId())
                .productId(device.getProductId())
                .productKey(product == null ? null : trimToNull(product.getProductKey()))
                .deviceName(trimToNull(device.getDeviceName()))
                .build();
    }

    public ResolvedDeviceIdentity resolveByProductKey(String productKey,
                                                      String deviceName,
                                                      List<DeviceLocatorInputDTO> locators) {
        String normalizedProductKey = trimToNull(productKey);
        if (normalizedProductKey == null) {
            return null;
        }

        List<DeviceLocatorInputDTO> candidates = new ArrayList<>();
        String normalizedDeviceName = trimToNull(deviceName);
        if (normalizedDeviceName != null) {
            DeviceLocatorInputDTO deviceNameLocator = new DeviceLocatorInputDTO();
            deviceNameLocator.setLocatorType("DEVICE_NAME");
            deviceNameLocator.setLocatorValue(normalizedDeviceName);
            deviceNameLocator.setPrimaryLocator(true);
            candidates.add(deviceNameLocator);
        }

        if (locators != null && !locators.isEmpty()) {
            locators.stream()
                    .filter(locator -> trimToNull(locator.getLocatorType()) != null && trimToNull(locator.getLocatorValue()) != null)
                    .sorted(Comparator.comparing(locator -> !Boolean.TRUE.equals(locator.getPrimaryLocator())))
                    .forEach(candidates::add);
        }

        for (DeviceLocatorInputDTO locator : candidates) {
            ResolvedDeviceIdentity resolved = resolveByLocator(
                    normalizedProductKey,
                    trimToNull(locator.getLocatorType()),
                    trimToNull(locator.getLocatorValue())
            );
            if (resolved != null) {
                return resolved;
            }
        }
        return null;
    }

    public Optional<String> resolveLoRaDevEui(ResolvedDeviceIdentity identity, Collection<LoRaWanDeviceInfo> knownDevices) {
        if (identity == null || identity.getDeviceId() == null || knownDevices == null || knownDevices.isEmpty()) {
            return Optional.empty();
        }

        String cachedDevEui = loRaDevEuiCache.get(identity.getDeviceId());
        if (cachedDevEui != null && containsDevEui(knownDevices, cachedDevEui)) {
            return Optional.of(cachedDevEui);
        }

        String deviceName = trimToNull(identity.getDeviceName());
        if (deviceName != null) {
            for (LoRaWanDeviceInfo deviceInfo : knownDevices) {
                if (deviceInfo == null) {
                    continue;
                }
                if (equalsIgnoreCase(deviceName, deviceInfo.getDevEui())
                        || equalsIgnoreCase(deviceName, deviceInfo.getDeviceName())) {
                    rememberLoRaMapping(identity.getDeviceId(), deviceInfo.getDevEui());
                    return Optional.ofNullable(deviceInfo.getDevEui());
                }
            }
        }

        String productKey = trimToNull(identity.getProductKey());
        if (productKey == null) {
            return Optional.empty();
        }

        for (LoRaWanDeviceInfo deviceInfo : knownDevices) {
            if (deviceInfo == null || trimToNull(deviceInfo.getDevEui()) == null) {
                continue;
            }
            for (String locatorType : LORAWAN_LOCATOR_TYPES) {
                ResolvedDeviceIdentity resolved = resolveByLocator(productKey, locatorType, deviceInfo.getDevEui());
                if (resolved != null && identity.getDeviceId().equals(resolved.getDeviceId())) {
                    rememberLoRaMapping(identity.getDeviceId(), deviceInfo.getDevEui());
                    return Optional.of(deviceInfo.getDevEui());
                }
            }
        }

        return Optional.empty();
    }

    private ResolvedDeviceIdentity resolveByLocator(String productKey, String locatorType, String locatorValue) {
        if (trimToNull(productKey) == null || trimToNull(locatorType) == null || trimToNull(locatorValue) == null) {
            return null;
        }

        try {
            DeviceLocatorResolveRequestDTO request = new DeviceLocatorResolveRequestDTO();
            request.setProductKey(productKey);
            request.setLocatorType(locatorType);
            request.setLocatorValue(locatorValue);
            R<DeviceLocatorResolveDTO> response = deviceLocatorClient.resolveByLocator(request);
            DeviceLocatorResolveDTO resolved = response == null ? null : response.getData();
            if (resolved == null || !resolved.isSuccess() || resolved.getDeviceId() == null) {
                return null;
            }
            return ResolvedDeviceIdentity.builder()
                    .deviceId(resolved.getDeviceId())
                    .tenantId(resolved.getTenantId())
                    .productId(resolved.getProductId())
                    .productKey(productKey)
                    .deviceName(trimToNull(resolved.getDeviceName()))
                    .build();
        } catch (Exception ex) {
            log.warn("Failed to resolve device identity by locator: productKey={}, locatorType={}, error={}",
                    productKey, locatorType, ex.getMessage());
            return null;
        }
    }

    private DeviceBasicVO loadDeviceBasic(Long deviceId) {
        try {
            R<DeviceBasicVO> response = deviceClient.getDeviceBasic(deviceId);
            return response == null ? null : response.getData();
        } catch (Exception ex) {
            log.warn("Failed to load device basic info: deviceId={}, error={}", deviceId, ex.getMessage());
            return null;
        }
    }

    private ProductBasicVO loadProductBasic(Long productId) {
        if (productId == null) {
            return null;
        }
        try {
            R<ProductBasicVO> response = productClient.getProductBasic(productId);
            return response == null ? null : response.getData();
        } catch (Exception ex) {
            log.warn("Failed to load product basic info: productId={}, error={}", productId, ex.getMessage());
            return null;
        }
    }

    private boolean containsDevEui(Collection<LoRaWanDeviceInfo> knownDevices, String devEui) {
        for (LoRaWanDeviceInfo deviceInfo : knownDevices) {
            if (deviceInfo != null && equalsIgnoreCase(devEui, deviceInfo.getDevEui())) {
                return true;
            }
        }
        return false;
    }

    private void rememberLoRaMapping(Long deviceId, String devEui) {
        if (deviceId != null && trimToNull(devEui) != null) {
            loRaDevEuiCache.put(deviceId, devEui.trim());
        }
    }

    private boolean equalsIgnoreCase(String left, String right) {
        String normalizedLeft = trimToNull(left);
        String normalizedRight = trimToNull(right);
        return normalizedLeft != null && normalizedLeft.equalsIgnoreCase(normalizedRight);
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
