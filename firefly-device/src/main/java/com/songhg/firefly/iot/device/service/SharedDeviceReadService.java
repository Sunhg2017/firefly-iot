package com.songhg.firefly.iot.device.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.api.dto.DeviceTelemetryPointDTO;
import com.songhg.firefly.iot.api.dto.DeviceTelemetrySnapshotDTO;
import com.songhg.firefly.iot.api.dto.SharedDeviceResolveRequestDTO;
import com.songhg.firefly.iot.api.dto.SharedDeviceTelemetryQueryDTO;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.DeviceTelemetryMapper;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class SharedDeviceReadService {

    private final DeviceMapper deviceMapper;
    private final ProductMapper productMapper;
    private final DeviceTelemetryMapper deviceTelemetryMapper;
    private final ObjectMapper objectMapper;

    public List<DeviceBasicVO> resolveSharedDevices(SharedDeviceResolveRequestDTO dto) {
        Long ownerTenantId = requireOwnerTenantId(dto == null ? null : dto.getOwnerTenantId());
        ScopeSelectors selectors = parseScope(dto == null ? null : dto.getScope());
        if (selectors.isEmpty()) {
            return List.of();
        }

        List<Long> productIds = resolveProductIds(ownerTenantId, new LinkedHashSet<>(selectors.productKeys()));
        if (!selectors.productKeys().isEmpty() && productIds.isEmpty()) {
            return List.of();
        }
        return deviceMapper.selectSharedBasicsIgnoreTenant(ownerTenantId, productIds, selectors.deviceNames());
    }

    public List<DeviceTelemetrySnapshotDTO> querySharedLatest(Long ownerTenantId, Long deviceId) {
        requireOwnedDevice(ownerTenantId, deviceId);
        return deviceTelemetryMapper.queryLatestIgnoreTenant(ownerTenantId, deviceId);
    }

    public List<DeviceTelemetryPointDTO> querySharedTelemetry(SharedDeviceTelemetryQueryDTO dto) {
        if (dto == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "共享遥测查询不能为空");
        }
        Long ownerTenantId = requireOwnerTenantId(dto.getOwnerTenantId());
        requireOwnedDevice(ownerTenantId, dto.getDeviceId());
        return deviceTelemetryMapper.queryTelemetryIgnoreTenant(
                ownerTenantId,
                dto.getDeviceId(),
                dto.getProperty(),
                dto.getStartTime(),
                dto.getEndTime(),
                dto.getLimit()
        );
    }

    private Long requireOwnerTenantId(Long ownerTenantId) {
        if (ownerTenantId == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "共享数据查询缺少所有方租户");
        }
        return ownerTenantId;
    }

    private Device requireOwnedDevice(Long ownerTenantId, Long deviceId) {
        if (deviceId == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "共享数据查询缺少设备编号");
        }
        Device device = deviceMapper.selectByIdIgnoreTenant(deviceId);
        if (device == null || device.getDeletedAt() != null) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND);
        }
        if (!ownerTenantId.equals(device.getTenantId())) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND);
        }
        return device;
    }

    private List<Long> resolveProductIds(Long ownerTenantId, Set<String> productKeys) {
        if (productKeys.isEmpty()) {
            return List.of();
        }
        List<Long> productIds = new ArrayList<>(productKeys.size());
        for (String productKey : productKeys) {
            Product product = productMapper.selectByProductKeyIgnoreTenant(productKey);
            if (product == null) {
                continue;
            }
            if (!ownerTenantId.equals(product.getTenantId())) {
                log.warn("Skip shared scope product outside owner tenant: ownerTenantId={}, productKey={}, actualTenantId={}",
                        ownerTenantId, productKey, product.getTenantId());
                continue;
            }
            productIds.add(product.getId());
        }
        return productIds;
    }

    private ScopeSelectors parseScope(String rawScope) {
        if (rawScope == null || rawScope.isBlank()) {
            return ScopeSelectors.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(rawScope);
            Set<String> productKeys = new LinkedHashSet<>();
            Set<String> deviceNames = new LinkedHashSet<>();
            collectStringValues(root.get("productKeys"), productKeys);
            collectStringValues(root.get("deviceNames"), deviceNames);
            collectStringValues(root.get("productKey"), productKeys);
            collectStringValues(root.get("deviceName"), deviceNames);
            return new ScopeSelectors(List.copyOf(productKeys), List.copyOf(deviceNames));
        } catch (Exception ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "共享范围必须是合法的 JSON");
        }
    }

    private void collectStringValues(JsonNode node, Set<String> bucket) {
        if (node == null || node.isNull()) {
            return;
        }
        if (node.isArray()) {
            for (JsonNode item : node) {
                collectStringValues(item, bucket);
            }
            return;
        }
        if (node.isTextual()) {
            String value = node.asText().trim();
            if (!value.isEmpty()) {
                bucket.add(value);
            }
        }
    }

    private record ScopeSelectors(List<String> productKeys, List<String> deviceNames) {

        private static ScopeSelectors empty() {
            return new ScopeSelectors(List.of(), List.of());
        }

        private boolean isEmpty() {
            return productKeys.isEmpty() && deviceNames.isEmpty();
        }
    }
}
