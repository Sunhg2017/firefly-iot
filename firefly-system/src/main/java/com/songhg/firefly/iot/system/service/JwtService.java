package com.songhg.firefly.iot.system.service;

import com.songhg.firefly.iot.common.constant.AuthConstants;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
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

    private KeyPair keyPair;

    @PostConstruct
    public void init() throws Exception {
        // In production, load from PEM files / key vault
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        this.keyPair = kpg.generateKeyPair();
        log.info("JWT RS256 key pair generated (dev mode)");
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
