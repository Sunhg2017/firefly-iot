package com.songhg.firefly.iot.media.gb28181;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.media.entity.VideoDevice;
import com.songhg.firefly.iot.media.mapper.VideoDeviceMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.sip.header.AuthorizationHeader;
import javax.sip.header.FromHeader;
import javax.sip.message.Request;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * GB28181 REGISTER Digest 鉴权服务。
 * <p>
 * 当前用户名固定使用视频设备的 GB 设备编号，只有开启设备级 SIP 密码后才发起 401 挑战。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SipRegisterAuthService {

    private static final long NONCE_TTL_SECONDS = 300L;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final HexFormat HEX = HexFormat.of();

    private final VideoDeviceMapper videoDeviceMapper;
    private final Map<String, NonceEntry> nonceCache = new ConcurrentHashMap<>();

    public RegisterAuthorization authorize(Request request, String defaultRealm) {
        String deviceId = resolveDeviceId(request);
        if (deviceId == null) {
            return RegisterAuthorization.allow(null);
        }

        VideoDevice device = videoDeviceMapper.selectOne(new LambdaQueryWrapper<VideoDevice>()
                .eq(VideoDevice::getGbDeviceId, deviceId)
                .last("LIMIT 1"));
        if (device == null || device.getSipPassword() == null || device.getSipPassword().isBlank()) {
            return RegisterAuthorization.allow(deviceId);
        }

        String realm = device.getGbDomain() != null && !device.getGbDomain().isBlank()
                ? device.getGbDomain()
                : defaultRealm;
        AuthorizationHeader authorizationHeader =
                (AuthorizationHeader) request.getHeader(AuthorizationHeader.NAME);
        if (authorizationHeader == null) {
            return RegisterAuthorization.challenge(deviceId, realm, issueNonce(deviceId));
        }

        if (!verifyAuthorization(request, device, authorizationHeader, realm)) {
            return RegisterAuthorization.challenge(deviceId, realm, issueNonce(deviceId));
        }
        return RegisterAuthorization.allow(deviceId);
    }

    private boolean verifyAuthorization(
            Request request,
            VideoDevice device,
            AuthorizationHeader authorizationHeader,
            String realm) {
        String username = trimToNull(authorizationHeader.getUsername());
        String nonce = trimToNull(authorizationHeader.getNonce());
        String response = trimToNull(authorizationHeader.getResponse());
        if (username == null || nonce == null || response == null) {
            return false;
        }
        if (!device.getGbDeviceId().equals(username)) {
            log.warn("GB28181 REGISTER auth username mismatch: expected={}, actual={}",
                    device.getGbDeviceId(), username);
            return false;
        }
        if (!realm.equals(trimToNull(authorizationHeader.getRealm()))) {
            log.warn("GB28181 REGISTER auth realm mismatch: expected={}, actual={}",
                    realm, authorizationHeader.getRealm());
            return false;
        }

        NonceEntry nonceEntry = nonceCache.get(nonce);
        if (nonceEntry == null || nonceEntry.isExpired() || !device.getGbDeviceId().equals(nonceEntry.deviceId())) {
            log.warn("GB28181 REGISTER auth nonce invalid or expired: deviceId={}", device.getGbDeviceId());
            nonceCache.remove(nonce);
            return false;
        }

        String ha1 = md5Hex(username + ":" + realm + ":" + device.getSipPassword());
        String ha2 = md5Hex(request.getMethod() + ":" + request.getRequestURI());
        String expectedResponse = md5Hex(ha1 + ":" + nonce + ":" + ha2);
        return expectedResponse.equalsIgnoreCase(response);
    }

    private String issueNonce(String deviceId) {
        clearExpiredNonces();
        byte[] random = new byte[16];
        RANDOM.nextBytes(random);
        String nonce = HEX.formatHex(random);
        nonceCache.put(nonce, new NonceEntry(deviceId, Instant.now().plusSeconds(NONCE_TTL_SECONDS).toEpochMilli()));
        return nonce;
    }

    private void clearExpiredNonces() {
        long now = System.currentTimeMillis();
        nonceCache.entrySet().removeIf((entry) -> entry.getValue().expiresAtMillis() <= now);
    }

    private String resolveDeviceId(Request request) {
        FromHeader fromHeader = (FromHeader) request.getHeader(FromHeader.NAME);
        if (fromHeader == null || fromHeader.getAddress() == null || fromHeader.getAddress().getURI() == null) {
            return null;
        }
        String deviceId = fromHeader.getAddress().getURI().toString();
        if (deviceId.contains(":")) {
            deviceId = deviceId.substring(deviceId.indexOf(':') + 1);
        }
        if (deviceId.contains("@")) {
            deviceId = deviceId.substring(0, deviceId.indexOf('@'));
        }
        return trimToNull(deviceId);
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String md5Hex(String value) {
        try {
            MessageDigest messageDigest = MessageDigest.getInstance("MD5");
            byte[] digest = messageDigest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HEX.formatHex(digest);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("MD5 algorithm unavailable", ex);
        }
    }

    private record NonceEntry(String deviceId, long expiresAtMillis) {
        private boolean isExpired() {
            return expiresAtMillis <= System.currentTimeMillis();
        }
    }

    public record RegisterAuthorization(boolean authorized, String deviceId, String realm, String nonce) {
        public static RegisterAuthorization allow(String deviceId) {
            return new RegisterAuthorization(true, deviceId, null, null);
        }

        public static RegisterAuthorization challenge(String deviceId, String realm, String nonce) {
            return new RegisterAuthorization(false, deviceId, realm, nonce);
        }
    }
}
