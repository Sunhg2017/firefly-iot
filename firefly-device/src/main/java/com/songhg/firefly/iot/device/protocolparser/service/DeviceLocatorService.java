package com.songhg.firefly.iot.device.protocolparser.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.songhg.firefly.iot.api.dto.DeviceLocatorResolveDTO;
import com.songhg.firefly.iot.api.dto.DeviceLocatorResolveRequestDTO;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.dto.device.DeviceLocatorCreateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceLocatorUpdateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceLocatorVO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import com.songhg.firefly.iot.device.protocolparser.entity.DeviceLocator;
import com.songhg.firefly.iot.device.protocolparser.mapper.DeviceLocatorMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
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

        String locatorType = normalizeLocatorType(request.getLocatorType());
        String locatorValue = normalizeLocatorValue(request.getLocatorValue());
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

    public List<DeviceLocatorVO> listByDeviceId(Long deviceId) {
        Device device = getDeviceOrThrow(deviceId);
        return deviceLocatorMapper.selectList(new LambdaQueryWrapper<DeviceLocator>()
                        .eq(DeviceLocator::getDeviceId, device.getId())
                        .isNull(DeviceLocator::getDeletedAt)
                        .orderByDesc(DeviceLocator::getIsPrimary)
                        .orderByAsc(DeviceLocator::getLocatorType)
                        .orderByAsc(DeviceLocator::getId))
                .stream()
                .map(this::toVO)
                .toList();
    }

    @Transactional
    public DeviceLocatorVO create(Long deviceId, DeviceLocatorCreateDTO dto) {
        Device device = getDeviceOrThrow(deviceId);
        String locatorType = normalizeLocatorType(dto.getLocatorType());
        String locatorValue = normalizeLocatorValue(dto.getLocatorValue());
        ensureUniqueLocator(device.getProductId(), locatorType, locatorValue, null);

        DeviceLocator locator = new DeviceLocator();
        locator.setTenantId(device.getTenantId());
        locator.setProductId(device.getProductId());
        locator.setDeviceId(device.getId());
        locator.setLocatorType(locatorType);
        locator.setLocatorValue(locatorValue);
        locator.setIsPrimary(Boolean.TRUE.equals(dto.getPrimaryLocator()));
        if (Boolean.TRUE.equals(locator.getIsPrimary())) {
            clearPrimaryLocator(device.getId(), locatorType, null);
        }
        deviceLocatorMapper.insert(locator);
        return toVO(locator);
    }

    @Transactional
    public DeviceLocatorVO update(Long deviceId, Long locatorId, DeviceLocatorUpdateDTO dto) {
        Device device = getDeviceOrThrow(deviceId);
        DeviceLocator locator = getLocatorOrThrow(device.getId(), locatorId);

        String locatorType = dto.getLocatorType() == null ? locator.getLocatorType() : normalizeLocatorType(dto.getLocatorType());
        String locatorValue = dto.getLocatorValue() == null ? locator.getLocatorValue() : normalizeLocatorValue(dto.getLocatorValue());
        ensureUniqueLocator(device.getProductId(), locatorType, locatorValue, locator.getId());

        locator.setLocatorType(locatorType);
        locator.setLocatorValue(locatorValue);
        if (dto.getPrimaryLocator() != null) {
            locator.setIsPrimary(dto.getPrimaryLocator());
        }
        if (Boolean.TRUE.equals(locator.getIsPrimary())) {
            clearPrimaryLocator(device.getId(), locatorType, locator.getId());
        }
        deviceLocatorMapper.updateById(locator);
        return toVO(locator);
    }

    @Transactional
    public void delete(Long deviceId, Long locatorId) {
        Device device = getDeviceOrThrow(deviceId);
        DeviceLocator locator = getLocatorOrThrow(device.getId(), locatorId);
        deviceLocatorMapper.deleteById(locator.getId());
    }

    @Transactional
    public void deleteByDeviceId(Long deviceId) {
        deviceLocatorMapper.delete(new LambdaUpdateWrapper<DeviceLocator>()
                .eq(DeviceLocator::getDeviceId, deviceId)
                .isNull(DeviceLocator::getDeletedAt));
    }

    private void ensureUniqueLocator(Long productId, String locatorType, String locatorValue, Long currentId) {
        DeviceLocator existing = deviceLocatorMapper.selectByProductIdAndLocatorIgnoreTenant(productId, locatorType, locatorValue);
        if (existing == null) {
            return;
        }
        if (currentId != null && currentId.equals(existing.getId())) {
            return;
        }
        throw new BizException(ResultCode.CONFLICT, "Locator already exists in current product");
    }

    private void clearPrimaryLocator(Long deviceId, String locatorType, Long excludeId) {
        LambdaUpdateWrapper<DeviceLocator> wrapper = new LambdaUpdateWrapper<DeviceLocator>()
                .eq(DeviceLocator::getDeviceId, deviceId)
                .eq(DeviceLocator::getLocatorType, locatorType)
                .isNull(DeviceLocator::getDeletedAt)
                .set(DeviceLocator::getIsPrimary, false);
        if (excludeId != null) {
            wrapper.ne(DeviceLocator::getId, excludeId);
        }
        deviceLocatorMapper.update(new DeviceLocator(), wrapper);
    }

    private Device getDeviceOrThrow(Long deviceId) {
        Device device = deviceMapper.selectById(deviceId);
        if (device == null || device.getDeletedAt() != null) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND);
        }
        return device;
    }

    private DeviceLocator getLocatorOrThrow(Long deviceId, Long locatorId) {
        DeviceLocator locator = deviceLocatorMapper.selectById(locatorId);
        if (locator == null || locator.getDeletedAt() != null || !deviceId.equals(locator.getDeviceId())) {
            throw new BizException(ResultCode.NOT_FOUND, "Device locator does not exist");
        }
        return locator;
    }

    private DeviceLocatorVO toVO(DeviceLocator locator) {
        DeviceLocatorVO vo = new DeviceLocatorVO();
        vo.setId(locator.getId());
        vo.setDeviceId(locator.getDeviceId());
        vo.setProductId(locator.getProductId());
        vo.setLocatorType(locator.getLocatorType());
        vo.setLocatorValue(locator.getLocatorValue());
        vo.setPrimaryLocator(locator.getIsPrimary());
        vo.setCreatedAt(locator.getCreatedAt());
        vo.setUpdatedAt(locator.getUpdatedAt());
        return vo;
    }

    private String normalizeLocatorType(String value) {
        if (isBlank(value)) {
            throw new BizException(ResultCode.PARAM_ERROR, "locatorType must not be blank");
        }
        return value.trim().toUpperCase(Locale.ROOT);
    }

    private String normalizeLocatorValue(String value) {
        if (isBlank(value)) {
            throw new BizException(ResultCode.PARAM_ERROR, "locatorValue must not be blank");
        }
        return value.trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
