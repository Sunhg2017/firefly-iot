package com.songhg.firefly.iot.system.service;

import com.songhg.firefly.iot.common.constant.AuthConstants;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Service
public class JwtService {

    @Value("${auth.access-token.expire-seconds:7200}")
    private long accessTokenExpireSeconds;

    /**
     * Base64(PKCS#8) RSA 私钥。必须由配置提供，缺失时启动失败，禁止运行时随机生成，
     * 否则网关无法持有与之匹配的公钥，Token 校验将不可用。
     */
    @Value("${auth.jwt.private-key:}")
    private String privateKeyBase64;

    private KeyPair keyPair;

    @PostConstruct
    public void init() throws Exception {
        if (!StringUtils.hasText(privateKeyBase64)) {
            throw new IllegalStateException(
                    "auth.jwt.private-key 未配置，服务拒绝启动；请通过 AUTH_JWT_PRIVATE_KEY 提供 Base64(PKCS#8) RSA 私钥");
        }
        try {
            byte[] keyBytes = Base64.getDecoder().decode(privateKeyBase64.trim());
            KeyFactory keyFactory = KeyFactory.getInstance("RSA");
            PrivateKey privateKey = keyFactory.generatePrivate(new PKCS8EncodedKeySpec(keyBytes));
            if (!(privateKey instanceof RSAPrivateCrtKey crtKey)) {
                throw new IllegalStateException("auth.jwt.private-key 必须是 RSA CRT(PKCS#8) 私钥");
            }
            PublicKey publicKey = keyFactory.generatePublic(
                    new RSAPublicKeySpec(crtKey.getModulus(), crtKey.getPublicExponent()));
            this.keyPair = new KeyPair(publicKey, privateKey);
            log.info("JWT RS256 key pair loaded from configuration");
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("auth.jwt.private-key 解析失败，服务拒绝启动: " + e.getMessage(), e);
        }
    }

    public String generateAccessToken(Long userId, Long tenantId, String platform,
                                       Set<String> roles, String fingerprintHash) {
        Instant now = Instant.now();
        Instant expiry = now.plusSeconds(accessTokenExpireSeconds);

        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(String.valueOf(userId))
                .issuer("firefly-iot-auth")
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiry))
                .claim(AuthConstants.JWT_CLAIM_TENANT_ID, String.valueOf(tenantId))
                .claim(AuthConstants.JWT_CLAIM_PLATFORM, platform)
                .claim(AuthConstants.JWT_CLAIM_ROLES, roles)
                .claim(AuthConstants.JWT_CLAIM_FINGERPRINT_HASH, fingerprintHash)
                .signWith(keyPair.getPrivate(), Jwts.SIG.RS256)
                .compact();
    }

    public String generateRefreshToken() {
        return "rt_" + UUID.randomUUID().toString().replace("-", "");
    }

    public Claims parseAccessToken(String token) {
        return Jwts.parser()
                .verifyWith(keyPair.getPublic())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public Map<String, Object> getPublicKeyInfo() {
        return Map.of(
                "algorithm", "RS256",
                "publicKey", Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded())
        );
    }

    public long getAccessTokenExpireSeconds() {
        return accessTokenExpireSeconds;
    }
}
