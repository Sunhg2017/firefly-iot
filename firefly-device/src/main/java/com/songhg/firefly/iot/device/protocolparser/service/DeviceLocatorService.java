package com.songhg.firefly.iot.device.protocolparser.service;

import com.songhg.firefly.iot.api.dto.DeviceLocatorResolveDTO;
import com.songhg.firefly.iot.api.dto.DeviceLocatorResolveRequestDTO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import com.songhg.firefly.iot.device.protocolparser.entity.DeviceLocator;
import com.songhg.firefly.iot.device.protocolparser.mapper.DeviceLocatorMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
@RequiredArgsConstructor
public class DeviceLocatorService {

    private final ProductMapper productMapper;
    private final DeviceMapper deviceMapper;
    private final DeviceLocatorMapper deviceLocatorMapper;

    public DeviceLocatorResolveDTO resolveByLocator(DeviceLocatorResolveRequestDTO request) {
        DeviceLocatorResolveDTO result = new DeviceLocatorResolveDTO();
        if (request == null || isBlank(request.getProductKey()) || isBlank(request.getLocatorType()) || isBlank(request.getLocatorValue())) {
            result.setSuccess(false);
            result.setErrorCode("PARAM_ERROR");
            return result;
        }

        Product product = productMapper.selectByProductKeyIgnoreTenant(request.getProductKey().trim());
        if (product == null) {
            result.setSuccess(false);
            result.setErrorCode("PRODUCT_NOT_FOUND");
            return result;
        }

        String locatorType = request.getLocatorType().trim().toUpperCase(Locale.ROOT);
        String locatorValue = request.getLocatorValue().trim();
        Device device;
        if ("DEVICE_NAME".equals(locatorType)) {
            device = deviceMapper.selectByProductIdAndDeviceNameIgnoreTenant(product.getId(), locatorValue);
        } else {
            DeviceLocator locator = deviceLocatorMapper.selectByProductIdAndLocatorIgnoreTenant(
                    product.getId(),
                    locatorType,
                    locatorValue
            );
            if (locator == null) {
                result.setSuccess(false);
                result.setErrorCode("DEVICE_NOT_FOUND");
                return result;
            }
            device = deviceMapper.selectByIdIgnoreTenant(locator.getDeviceId());
        }

        if (device == null) {
            result.setSuccess(false);
            result.setErrorCode("DEVICE_NOT_FOUND");
            return result;
        }

        result.setSuccess(true);
        result.setDeviceId(device.getId());
        result.setTenantId(device.getTenantId());
        result.setProductId(device.getProductId());
        result.setDeviceName(device.getDeviceName());
        return result;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
