package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.api.dto.DeviceAuthDTO;
import com.songhg.firefly.iot.api.dto.DeviceRegisterDTO;
import com.songhg.firefly.iot.api.dto.DeviceRegisterRequestDTO;
import com.songhg.firefly.iot.api.dto.DeviceUnregisterDTO;
import com.songhg.firefly.iot.api.dto.DeviceUnregisterRequestDTO;
import com.songhg.firefly.iot.common.context.AppContext;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.DeviceAuthType;
import com.songhg.firefly.iot.common.enums.DeviceStatus;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import com.songhg.firefly.iot.device.dto.device.DeviceNameRules;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.function.Supplier;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceCredentialService {

    private static final String CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern DEVICE_NAME_PATTERN = Pattern.compile(DeviceNameRules.REGEX);
    private static final String SESSION_CACHE_PREFIX = "device:session:";
    private static final Duration SESSION_CACHE_TTL = Duration.ofHours(12);

    private final ProductMapper productMapper;
    private final DeviceMapper deviceMapper;
    private final StringRedisTemplate redisTemplate;
    private final DeviceService deviceService;

    public DeviceAuthDTO authenticate(String productKey, String deviceName, String deviceSecret) {
        if (isBlank(productKey) || isBlank(deviceName)) {
            return authFailed("INVALID_CREDENTIALS");
        }
        if (isBlank(deviceSecret)) {
            return authFailed("DEVICE_SECRET_REQUIRED");
        }

        Product product = productMapper.selectByProductKeyIgnoreTenant(productKey);
        if (product == null) {
            return authFailed("PRODUCT_NOT_FOUND");
        }

        Device device = deviceMapper.selectByProductIdAndDeviceNameIgnoreTenant(product.getId(), deviceName);
        if (device == null) {
            return authFailed("DEVICE_NOT_FOUND");
        }
        if (device.getStatus() == DeviceStatus.DISABLED) {
            return authFailed("DEVICE_DISABLED");
        }
        if (!deviceSecret.equals(device.getDeviceSecret())) {
            return authFailed("INVALID_SECRET");
        }

        cacheSession(productKey, deviceName, device);
        return authSuccess(device);
    }

    public DeviceAuthDTO resolveSession(String productKey, String deviceName) {
        if (isBlank(productKey) || isBlank(deviceName)) {
            return authFailed("INVALID_CREDENTIALS");
        }

        String cached = redisTemplate.opsForValue().get(buildSessionKey(productKey, deviceName));
        if (cached == null) {
            return authFailed("SESSION_NOT_FOUND");
        }

        String[] parts = cached.split(":");
        if (parts.length < 3) {
            redisTemplate.delete(buildSessionKey(productKey, deviceName));
            return authFailed("SESSION_NOT_FOUND");
        }

        DeviceAuthDTO dto = new DeviceAuthDTO();
        dto.setSuccess(true);
        dto.setDeviceId(Long.parseLong(parts[0]));
        dto.setTenantId(Long.parseLong(parts[1]));
        dto.setProductId(Long.parseLong(parts[2]));
        return dto;
    }

    public void clearSession(String productKey, String deviceName) {
        if (isBlank(productKey) || isBlank(deviceName)) {
            return;
        }
        redisTemplate.delete(buildSessionKey(productKey, deviceName));
    }

    @Transactional
    public DeviceRegisterDTO dynamicRegister(DeviceRegisterRequestDTO request) {
        if (request == null || isBlank(request.getProductKey()) || isBlank(request.getProductSecret())
                || isBlank(request.getDeviceName())) {
            return registerFailed("INVALID_REQUEST");
        }
        if (!DEVICE_NAME_PATTERN.matcher(request.getDeviceName()).matches()) {
            return registerFailed("INVALID_DEVICE_NAME");
        }

        Product product = productMapper.selectByProductKeyIgnoreTenant(request.getProductKey());
        if (product == null) {
            return registerFailed("PRODUCT_NOT_FOUND");
        }
        if (product.getDeviceAuthType() != DeviceAuthType.PRODUCT_SECRET) {
            return registerFailed("PRODUCT_DYNAMIC_REGISTER_DISABLED");
        }
        if (isBlank(product.getProductSecret()) || !product.getProductSecret().equals(request.getProductSecret())) {
            return registerFailed("INVALID_PRODUCT_SECRET");
        }

        try {
            return executeWithTenant(product.getTenantId(), () -> doDynamicRegister(product, request));
        } catch (DuplicateKeyException ex) {
            log.warn("Dynamic register duplicate device: productKey={}, deviceName={}",
                    request.getProductKey(), request.getDeviceName(), ex);
            return registerFailed("DEVICE_NAME_EXISTS");
        }
    }

    @Transactional
    public DeviceUnregisterDTO dynamicUnregister(DeviceUnregisterRequestDTO request) {
        if (request == null || isBlank(request.getProductKey()) || isBlank(request.getProductSecret())
                || isBlank(request.getDeviceName())) {
            return unregisterFailed("INVALID_REQUEST");
        }

        Product product = productMapper.selectByProductKeyIgnoreTenant(request.getProductKey());
        if (product == null) {
            return unregisterFailed("PRODUCT_NOT_FOUND");
        }
        if (product.getDeviceAuthType() != DeviceAuthType.PRODUCT_SECRET) {
            return unregisterFailed("PRODUCT_DYNAMIC_REGISTER_DISABLED");
        }
        if (isBlank(product.getProductSecret()) || !product.getProductSecret().equals(request.getProductSecret())) {
            return unregisterFailed("INVALID_PRODUCT_SECRET");
        }

        return executeWithTenant(product.getTenantId(), () -> doDynamicUnregister(product, request));
    }

    private DeviceRegisterDTO doDynamicRegister(Product product, DeviceRegisterRequestDTO request) {
        Device existing = deviceMapper.selectOne(new LambdaQueryWrapper<Device>()
                .eq(Device::getProductId, product.getId())
                .eq(Device::getDeviceName, request.getDeviceName())
                .isNull(Device::getDeletedAt)
                .last("LIMIT 1"));
        if (existing != null) {
            return registerFailed("DEVICE_NAME_EXISTS");
        }

        Device device = new Device();
        device.setTenantId(product.getTenantId());
        device.setProductId(product.getId());
        device.setProjectId(product.getProjectId());
        device.setDeviceName(request.getDeviceName());
        device.setDeviceSecret(generateDeviceSecret());
        device.setNickname(request.getNickname());
        device.setDescription(request.getDescription());
        device.setTags(request.getTags());
        device.setStatus(DeviceStatus.INACTIVE);
        device.setOnlineStatus(OnlineStatus.UNKNOWN);
        deviceMapper.insert(device);

        product.setDeviceCount(product.getDeviceCount() != null ? product.getDeviceCount() + 1 : 1);
        productMapper.updateById(product);

        log.info("Device dynamically registered: deviceId={}, productKey={}, deviceName={}",
                device.getId(), request.getProductKey(), request.getDeviceName());

        DeviceRegisterDTO dto = new DeviceRegisterDTO();
        dto.setSuccess(true);
        dto.setDeviceId(device.getId());
        dto.setTenantId(device.getTenantId());
        dto.setProductId(device.getProductId());
        dto.setDeviceName(device.getDeviceName());
        dto.setDeviceSecret(device.getDeviceSecret());
        return dto;
    }

    private DeviceUnregisterDTO doDynamicUnregister(Product product, DeviceUnregisterRequestDTO request) {
        Device existing = deviceMapper.selectByProductIdAndDeviceNameIgnoreTenant(product.getId(), request.getDeviceName());
        if (existing == null) {
            DeviceUnregisterDTO dto = new DeviceUnregisterDTO();
            dto.setSuccess(true);
            dto.setRemoved(false);
            dto.setDeviceName(request.getDeviceName());
            return dto;
        }

        deviceService.deleteDevice(existing.getId());
        clearSession(request.getProductKey(), request.getDeviceName());

        DeviceUnregisterDTO dto = new DeviceUnregisterDTO();
        dto.setSuccess(true);
        dto.setRemoved(true);
        dto.setDeviceName(existing.getDeviceName());
        return dto;
    }

    private void cacheSession(String productKey, String deviceName, Device device) {
        redisTemplate.opsForValue().set(
                buildSessionKey(productKey, deviceName),
                device.getId() + ":" + device.getTenantId() + ":" + device.getProductId(),
                SESSION_CACHE_TTL
        );
    }

    private String buildSessionKey(String productKey, String deviceName) {
        return SESSION_CACHE_PREFIX + productKey + ":" + deviceName;
    }

    private DeviceAuthDTO authSuccess(Device device) {
        DeviceAuthDTO dto = new DeviceAuthDTO();
        dto.setSuccess(true);
        dto.setDeviceId(device.getId());
        dto.setTenantId(device.getTenantId());
        dto.setProductId(device.getProductId());
        return dto;
    }

    private DeviceAuthDTO authFailed(String errorCode) {
        DeviceAuthDTO dto = new DeviceAuthDTO();
        dto.setSuccess(false);
        dto.setErrorCode(errorCode);
        return dto;
    }

    private DeviceRegisterDTO registerFailed(String errorCode) {
        DeviceRegisterDTO dto = new DeviceRegisterDTO();
        dto.setSuccess(false);
        dto.setErrorCode(errorCode);
        return dto;
    }

    private DeviceUnregisterDTO unregisterFailed(String errorCode) {
        DeviceUnregisterDTO dto = new DeviceUnregisterDTO();
        dto.setSuccess(false);
        dto.setErrorCode(errorCode);
        return dto;
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

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private <T> T executeWithTenant(Long tenantId, Supplier<T> action) {
        AppContext previous = AppContextHolder.get();
        AppContext temp = new AppContext();
        temp.setTenantId(tenantId);
        AppContextHolder.set(temp);
        try {
            return action.get();
        } finally {
            if (previous != null) {
                AppContextHolder.set(previous);
            } else {
                AppContextHolder.clear();
            }
        }
    }
}
