package com.songhg.firefly.iot.media.gb28181;

import com.songhg.firefly.iot.api.dto.InternalVideoDeviceVO;
import com.songhg.firefly.iot.media.service.VideoDeviceFacade;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.sip.address.URI;
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
 * 当前用户名固定使用视频设备的 GB 设备编号，GB28181 设备统一强制 Digest 鉴权。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SipRegisterAuthService {

    private static final long NONCE_TTL_SECONDS = 300L;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final HexFormat HEX = HexFormat.of();

    private final VideoDeviceFacade videoDeviceFacade;
    private final Map<String, NonceEntry> nonceCache = new ConcurrentHashMap<>();

    public RegisterAuthorization authorize(Request request, String defaultRealm) {
        SipIdentity identity = resolveIdentity(request);
        if (identity.deviceId() == null) {
            return RegisterAuthorization.challenge(null, resolveRealm(null, null, defaultRealm),
                    issueNonce("unknown"), "缺少 GB 设备编号");
        }

        InternalVideoDeviceVO device = videoDeviceFacade.getByGbIdentity(identity.deviceId(), identity.gbDomain());
        String realm = resolveRealm(device, identity.gbDomain(), defaultRealm);
        if (device == null) {
            return RegisterAuthorization.challenge(identity.deviceId(), realm, issueNonce(identity.deviceId()), "未找到对应的视频设备");
        }

        String sipPassword = trimToNull(device.getSipPassword());
        if (sipPassword == null) {
            log.warn("Reject REGISTER without SIP password: gbDeviceId={}, gbDomain={}",
                    identity.deviceId(), identity.gbDomain());
            return RegisterAuthorization.challenge(identity.deviceId(), realm, issueNonce(identity.deviceId()),
                    "设备未配置 SIP 密码，禁止无鉴权注册");
        }

        AuthorizationHeader authorizationHeader =
                (AuthorizationHeader) request.getHeader(AuthorizationHeader.NAME);
        if (authorizationHeader == null) {
            return RegisterAuthorization.challenge(identity.deviceId(), realm, issueNonce(identity.deviceId()), "缺少 SIP 认证信息");
        }

        String failureReason = verifyAuthorization(request, device, authorizationHeader, realm);
        if (failureReason != null) {
            return RegisterAuthorization.challenge(identity.deviceId(), realm, issueNonce(identity.deviceId()), failureReason);
        }
        return RegisterAuthorization.allow(identity.deviceId());
    }

    private String verifyAuthorization(
            Request request,
            InternalVideoDeviceVO device,
            AuthorizationHeader authorizationHeader,
            String realm) {
        String username = trimToNull(authorizationHeader.getUsername());
        String nonce = trimToNull(authorizationHeader.getNonce());
        String response = trimToNull(authorizationHeader.getResponse());
        if (username == null || nonce == null || response == null) {
            return "SIP 认证参数不完整";
        }
        if (!device.getGbDeviceId().equals(username)) {
            log.warn("GB28181 REGISTER auth username mismatch: expected={}, actual={}",
                    device.getGbDeviceId(), username);
            return "SIP 用户名不匹配";
        }
        if (!realm.equals(trimToNull(authorizationHeader.getRealm()))) {
            log.warn("GB28181 REGISTER auth realm mismatch: expected={}, actual={}",
                    realm, authorizationHeader.getRealm());
            return "SIP 域不匹配";
        }

        NonceEntry nonceEntry = nonceCache.get(nonce);
        if (nonceEntry == null || nonceEntry.isExpired() || !device.getGbDeviceId().equals(nonceEntry.deviceId())) {
            log.warn("GB28181 REGISTER auth nonce invalid or expired: deviceId={}", device.getGbDeviceId());
            nonceCache.remove(nonce);
            return "SIP 认证已过期，请重新注册";
        }

        String ha1 = md5Hex(username + ":" + realm + ":" + device.getSipPassword());
        String ha2 = md5Hex(request.getMethod() + ":" + request.getRequestURI());
        String expectedResponse = md5Hex(ha1 + ":" + nonce + ":" + ha2);
        return expectedResponse.equalsIgnoreCase(response) ? null : "SIP 密码错误";
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

    private SipIdentity resolveIdentity(Request request) {
        FromHeader fromHeader = (FromHeader) request.getHeader(FromHeader.NAME);
        if (fromHeader == null || fromHeader.getAddress() == null) {
            return new SipIdentity(null, null);
        }
        URI uri = fromHeader.getAddress().getURI();
        if (uri == null) {
            return new SipIdentity(null, null);
        }
        String raw = uri.toString();
        String deviceId = raw;
        if (deviceId.contains(":")) {
            deviceId = deviceId.substring(deviceId.indexOf(':') + 1);
        }
        String gbDomain = null;
        if (deviceId.contains("@")) {
            gbDomain = deviceId.substring(deviceId.indexOf('@') + 1);
            deviceId = deviceId.substring(0, deviceId.indexOf('@'));
        }
        return new SipIdentity(trimToNull(deviceId), trimToNull(gbDomain));
    }

    private String resolveRealm(InternalVideoDeviceVO device, String gbDomain, String defaultRealm) {
        String realm = trimToNull(device == null ? null : device.getGbDomain());
        if (realm != null) {
            return realm;
        }
        realm = trimToNull(gbDomain);
        realm = realm != null ? realm : trimToNull(defaultRealm);
        return realm != null ? realm : "firefly";
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

    private record SipIdentity(String deviceId, String gbDomain) {
    }

    public record RegisterAuthorization(
            boolean authorized,
            String deviceId,
            String realm,
            String nonce,
            String failureReason) {
        public static RegisterAuthorization allow(String deviceId) {
            return new RegisterAuthorization(true, deviceId, null, null, null);
        }

        public static RegisterAuthorization challenge(String deviceId, String realm, String nonce, String failureReason) {
            return new RegisterAuthorization(false, deviceId, realm, nonce, failureReason);
        }
    }
}
