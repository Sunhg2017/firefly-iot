package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.dto.certificate.SasTokenVO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;

/**
 * 设备 SAS 时效令牌：以设备密钥为 HMAC 密钥，载荷包含设备/租户/产品与过期时间。
 * 适用于短期接入与调试；高安全场景建议使用 X.509 证书。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SasTokenService {

    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final long MAX_TTL_SECONDS = 86400L;

    private final DeviceMapper deviceMapper;

    public SasTokenVO issue(Long deviceId, long ttlSeconds) {
        Long tenantId = AppContextHolder.getTenantId();
        Device device = deviceMapper.selectOne(new LambdaQueryWrapper<Device>()
                .eq(Device::getId, deviceId)
                .eq(Device::getTenantId, tenantId)
                .isNull(Device::getDeletedAt));
        if (device == null) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND);
        }
        long ttl = ttlSeconds <= 0 ? 3600L : Math.min(ttlSeconds, MAX_TTL_SECONDS);
        long expiresAt = Instant.now().getEpochSecond() + ttl;
        String payload = device.getId() + ":" + device.getTenantId() + ":" + device.getProductId() + ":" + expiresAt;
        String encodedPayload = base64Url(payload.getBytes(StandardCharsets.UTF_8));
        String signature = sign(encodedPayload, device.getDeviceSecret());
        return new SasTokenVO(encodedPayload + "." + signature, Instant.ofEpochSecond(expiresAt));
    }

    /**
     * 认证阶段校验：签名、过期时间与设备归属必须同时匹配。
     */
    public boolean validate(Device device, String token) {
        if (device == null || !StringUtils.hasText(token) || !StringUtils.hasText(device.getDeviceSecret())) {
            return false;
        }
        String[] parts = token.trim().split("\\.");
        if (parts.length != 2) {
            return false;
        }
        try {
            String expected = sign(parts[0], device.getDeviceSecret());
            if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                    parts[1].getBytes(StandardCharsets.UTF_8))) {
                return false;
            }
            String payload = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
            String[] fields = payload.split(":");
            if (fields.length != 4) {
                return false;
            }
            long expiresAt = Long.parseLong(fields[3]);
            return expiresAt > Instant.now().getEpochSecond()
                    && String.valueOf(device.getId()).equals(fields[0])
                    && String.valueOf(device.getTenantId()).equals(fields[1])
                    && String.valueOf(device.getProductId()).equals(fields[2]);
        } catch (Exception ex) {
            log.debug("SAS token validation failed: {}", ex.getMessage());
            return false;
        }
    }

    private String sign(String data, String secret) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            return base64Url(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("SAS token signature failed", ex);
        }
    }

    private String base64Url(byte[] data) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data);
    }
}
