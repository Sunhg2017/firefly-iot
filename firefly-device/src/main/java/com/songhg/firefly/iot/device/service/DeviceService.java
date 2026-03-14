package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.DeviceAuthType;
import com.songhg.firefly.iot.common.enums.DeviceStatus;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.mybatis.DataScope;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.convert.DeviceConvert;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchCreateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchCreateItemDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceCreateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceCredentialVO;
import com.songhg.firefly.iot.device.dto.device.DeviceQueryDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceTripleExportDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceUpdateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceVO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import com.songhg.firefly.iot.device.protocolparser.service.DeviceLocatorService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceService {

    private final DeviceMapper deviceMapper;
    private final ProductMapper productMapper;
    private final DeviceLocatorService deviceLocatorService;

    private static final String CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    @Transactional
    public DeviceCredentialVO createDevice(DeviceCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();
        Product product = getProductOrThrow(dto.getProductId());
        validateManualRegistrationAllowed(product);
        validateUniqueDeviceNames(dto.getProductId(), List.of(dto.getDeviceName()));

        Device device = buildDevice(
                tenantId,
                userId,
                dto.getProductId(),
                dto.getProjectId(),
                dto.getDeviceName(),
                dto.getNickname(),
                dto.getDescription(),
                dto.getTags()
        );
        deviceMapper.insert(device);
        increaseProductDeviceCount(product, 1);

        log.info("Device created: id={}, deviceName={}, productId={}", device.getId(), device.getDeviceName(), dto.getProductId());
        return toCredentialVO(device, product);
    }

    @Transactional
    public List<DeviceCredentialVO> batchCreateDevices(DeviceBatchCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();
        Product product = getProductOrThrow(dto.getProductId());
        validateManualRegistrationAllowed(product);

        List<DeviceBatchCreateItemDTO> items = dto.getDevices() == null ? Collections.emptyList() : dto.getDevices();
        if (items.isEmpty()) {
            throw new BizException(ResultCode.BAD_REQUEST, "设备列表不能为空");
        }

        List<String> deviceNames = items.stream()
                .map(DeviceBatchCreateItemDTO::getDeviceName)
                .filter(Objects::nonNull)
                .toList();
        validateUniqueDeviceNames(dto.getProductId(), deviceNames);

        List<DeviceCredentialVO> result = new ArrayList<>(items.size());
        for (DeviceBatchCreateItemDTO item : items) {
            Device device = buildDevice(
                    tenantId,
                    userId,
                    dto.getProductId(),
                    dto.getProjectId(),
                    item.getDeviceName(),
                    item.getNickname(),
                    dto.getDescription(),
                    dto.getTags()
            );
            deviceMapper.insert(device);
            result.add(toCredentialVO(device, product));
        }

        increaseProductDeviceCount(product, items.size());
        log.info("Devices batch created: count={}, productId={}", items.size(), dto.getProductId());
        return result;
    }

    public DeviceVO getDeviceById(Long id) {
        Device device = getActiveDevice(id);
        return DeviceConvert.INSTANCE.toVO(device);
    }

    @DataScope
    public IPage<DeviceVO> listDevices(DeviceQueryDTO query) {
        Page<Device> page = new Page<>(query.getPageNum(), query.getPageSize());
        IPage<Device> result = deviceMapper.selectPage(page, buildListWrapper(query));
        return result.convert(DeviceConvert.INSTANCE::toVO);
    }

    @DataScope
    public List<DeviceCredentialVO> exportDeviceTriples(DeviceTripleExportDTO dto) {
        DeviceTripleExportDTO exportQuery = dto == null ? new DeviceTripleExportDTO() : dto;
        LambdaQueryWrapper<Device> wrapper = buildExportWrapper(exportQuery);
        List<Device> devices = deviceMapper.selectList(wrapper);
        if (devices.isEmpty()) {
            return Collections.emptyList();
        }

        Map<Long, Product> productMap = productMapper.selectBatchIds(
                        devices.stream().map(Device::getProductId).filter(Objects::nonNull).distinct().toList()
                ).stream()
                .collect(Collectors.toMap(Product::getId, item -> item));

        return devices.stream()
                .map(device -> toCredentialVO(device, productMap.get(device.getProductId())))
                .toList();
    }

    @Transactional
    public DeviceVO updateDevice(Long id, DeviceUpdateDTO dto) {
        Device device = getActiveDevice(id);
        DeviceConvert.INSTANCE.updateEntity(dto, device);
        deviceMapper.updateById(device);
        return DeviceConvert.INSTANCE.toVO(device);
    }

    @Transactional
    public void enableDevice(Long id) {
        Device device = getActiveDevice(id);
        if (device.getStatus() != DeviceStatus.DISABLED) {
            throw new BizException(ResultCode.DEVICE_STATUS_ERROR);
        }
        device.setStatus(DeviceStatus.ACTIVE);
        deviceMapper.updateById(device);
        log.info("Device enabled: id={}, deviceName={}", id, device.getDeviceName());
    }

    @Transactional
    public void disableDevice(Long id) {
        Device device = getActiveDevice(id);
        if (device.getStatus() == DeviceStatus.DISABLED) {
            throw new BizException(ResultCode.DEVICE_STATUS_ERROR);
        }
        device.setStatus(DeviceStatus.DISABLED);
        device.setOnlineStatus(OnlineStatus.OFFLINE);
        deviceMapper.updateById(device);
        log.info("Device disabled: id={}, deviceName={}", id, device.getDeviceName());
    }

    @Transactional
    public void deleteDevice(Long id) {
        Device device = getActiveDevice(id);
        deviceLocatorService.deleteByDeviceId(device.getId());
        device.setOnlineStatus(OnlineStatus.OFFLINE);

        // Device uses MyBatis-Plus logical delete on deletedAt.
        // Deleting through deleteById keeps logical-delete SQL and query filtering consistent.
        deviceMapper.updateById(device);
        deviceMapper.deleteById(device.getId());

        Product product = productMapper.selectById(device.getProductId());
        if (product != null && product.getDeviceCount() != null && product.getDeviceCount() > 0) {
            product.setDeviceCount(product.getDeviceCount() - 1);
            productMapper.updateById(product);
        }

        log.info("Device deleted: id={}, deviceName={}", id, device.getDeviceName());
    }

    public String getDeviceSecret(Long id) {
        Device device = getActiveDevice(id);
        return device.getDeviceSecret();
    }

    public DeviceBasicVO getDeviceBasic(Long id) {
        return deviceMapper.selectBasicByIdIgnoreTenant(id);
    }

    public List<DeviceBasicVO> batchGetDeviceBasic(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        return deviceMapper.selectBasicByIdsIgnoreTenant(ids);
    }

    public Long countByProductId(Long productId) {
        if (productId == null) {
            return 0L;
        }
        Long count = deviceMapper.countByProductIdIgnoreTenant(productId);
        return count == null ? 0L : count;
    }

    @Transactional
    public void updateRuntimeConnectionState(Long tenantId, Long deviceId, OnlineStatus onlineStatus, LocalDateTime occurredAt) {
        if (deviceId == null || onlineStatus == null) {
            return;
        }

        Device device = deviceMapper.selectByIdIgnoreTenant(deviceId);
        if (device == null || device.getDeletedAt() != null) {
            log.warn("Skip runtime connection update because device does not exist: deviceId={}", deviceId);
            return;
        }
        if (tenantId != null && device.getTenantId() != null && !tenantId.equals(device.getTenantId())) {
            log.warn("Skip runtime connection update because tenant mismatch: deviceId={}, tenantId={}, actualTenantId={}",
                    deviceId, tenantId, device.getTenantId());
            return;
        }

        LocalDateTime changedAt = occurredAt != null ? occurredAt : LocalDateTime.now();
        device.setOnlineStatus(onlineStatus);
        if (onlineStatus == OnlineStatus.ONLINE) {
            device.setLastOnlineAt(changedAt);
        } else if (onlineStatus == OnlineStatus.OFFLINE) {
            device.setLastOfflineAt(changedAt);
        }
        deviceMapper.updateById(device);
    }

    private Product getProductOrThrow(Long productId) {
        Product product = productMapper.selectById(productId);
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }
        return product;
    }

    private void validateManualRegistrationAllowed(Product product) {
        if (product.getDeviceAuthType() == DeviceAuthType.PRODUCT_SECRET) {
            throw new BizException(ResultCode.BAD_REQUEST, "当前产品为一型一密，请通过产品接入工具中的动态注册创建设备");
        }
    }

    private Device buildDevice(
            Long tenantId,
            Long userId,
            Long productId,
            Long projectId,
            String deviceName,
            String nickname,
            String description,
            String tags
    ) {
        Device device = new Device();
        device.setTenantId(tenantId);
        device.setProductId(productId);
        device.setProjectId(projectId);
        device.setDeviceName(trimToNull(deviceName));
        device.setNickname(trimToNull(nickname));
        device.setDescription(trimToNull(description));
        device.setTags(trimToNull(tags));
        device.setDeviceSecret(generateDeviceSecret());
        device.setStatus(DeviceStatus.INACTIVE);
        device.setOnlineStatus(OnlineStatus.UNKNOWN);
        device.setCreatedBy(userId);
        return device;
    }

    private void validateUniqueDeviceNames(Long productId, Collection<String> rawDeviceNames) {
        List<String> deviceNames = rawDeviceNames == null
                ? Collections.emptyList()
                : rawDeviceNames.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(item -> !item.isEmpty())
                .toList();
        if (deviceNames.isEmpty()) {
            throw new BizException(ResultCode.BAD_REQUEST, "设备名称不能为空");
        }

        Set<String> requestDuplicates = collectDuplicateValues(deviceNames);
        if (!requestDuplicates.isEmpty()) {
            throw new BizException(ResultCode.DEVICE_NAME_EXISTS, "请求中存在重复设备名称: " + String.join(", ", requestDuplicates));
        }

        List<Device> existingDevices = deviceMapper.selectList(new LambdaQueryWrapper<Device>()
                .eq(Device::getProductId, productId)
                .in(Device::getDeviceName, deviceNames)
                .isNull(Device::getDeletedAt));
        if (!existingDevices.isEmpty()) {
            Set<String> existingNames = existingDevices.stream()
                    .map(Device::getDeviceName)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toCollection(LinkedHashSet::new));
            throw new BizException(ResultCode.DEVICE_NAME_EXISTS, "设备名称已存在: " + String.join(", ", existingNames));
        }
    }

    private Set<String> collectDuplicateValues(Collection<String> values) {
        Set<String> seen = new LinkedHashSet<>();
        Set<String> duplicates = new LinkedHashSet<>();
        for (String value : values) {
            if (!seen.add(value)) {
                duplicates.add(value);
            }
        }
        return duplicates;
    }

    private void increaseProductDeviceCount(Product product, int increment) {
        int currentCount = product.getDeviceCount() == null ? 0 : product.getDeviceCount();
        product.setDeviceCount(currentCount + increment);
        productMapper.updateById(product);
    }

    private LambdaQueryWrapper<Device> buildListWrapper(DeviceQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        LambdaQueryWrapper<Device> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Device::getTenantId, tenantId);
        wrapper.isNull(Device::getDeletedAt);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.and(w -> w.like(Device::getDeviceName, query.getKeyword())
                    .or().like(Device::getNickname, query.getKeyword()));
        }
        if (query.getProductId() != null) {
            wrapper.eq(Device::getProductId, query.getProductId());
        }
        if (query.getProjectId() != null) {
            wrapper.eq(Device::getProjectId, query.getProjectId());
        }
        if (query.getStatus() != null) {
            wrapper.eq(Device::getStatus, query.getStatus());
        }
        if (query.getOnlineStatus() != null) {
            wrapper.eq(Device::getOnlineStatus, query.getOnlineStatus());
        }
        wrapper.orderByDesc(Device::getCreatedAt);
        return wrapper;
    }

    private LambdaQueryWrapper<Device> buildExportWrapper(DeviceTripleExportDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        LambdaQueryWrapper<Device> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Device::getTenantId, tenantId);
        wrapper.isNull(Device::getDeletedAt);
        if (query.getDeviceIds() != null && !query.getDeviceIds().isEmpty()) {
            wrapper.in(Device::getId, query.getDeviceIds());
        } else {
            if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
                wrapper.and(w -> w.like(Device::getDeviceName, query.getKeyword())
                        .or().like(Device::getNickname, query.getKeyword()));
            }
            if (query.getProductId() != null) {
                wrapper.eq(Device::getProductId, query.getProductId());
            }
            if (query.getStatus() != null) {
                wrapper.eq(Device::getStatus, query.getStatus());
            }
            if (query.getOnlineStatus() != null) {
                wrapper.eq(Device::getOnlineStatus, query.getOnlineStatus());
            }
        }
        wrapper.orderByDesc(Device::getCreatedAt);
        return wrapper;
    }

    private DeviceCredentialVO toCredentialVO(Device device, Product product) {
        DeviceCredentialVO vo = new DeviceCredentialVO();
        vo.setId(device.getId());
        vo.setProductId(device.getProductId());
        vo.setProductKey(product != null ? product.getProductKey() : null);
        vo.setProductName(product != null ? product.getName() : null);
        vo.setDeviceName(device.getDeviceName());
        vo.setNickname(device.getNickname());
        vo.setDeviceSecret(device.getDeviceSecret());
        return vo;
    }

    private Device getActiveDevice(Long id) {
        Device device = deviceMapper.selectById(id);
        if (device == null || device.getDeletedAt() != null) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND);
        }
        return device;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String generateDeviceSecret() {
        return "ds_" + randomString(32);
    }

    private String randomString(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(CHARS.charAt(RANDOM.nextInt(CHARS.length())));
        }
        return sb.toString();
    }
}
