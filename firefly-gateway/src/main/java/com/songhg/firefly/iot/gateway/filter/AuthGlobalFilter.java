package com.songhg.firefly.iot.gateway.filter;

import com.songhg.firefly.iot.common.constant.AuthConstants;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class AuthGlobalFilter implements GlobalFilter, Ordered {

    private final ReactiveStringRedisTemplate redisTemplate;

    @Value("${auth.jwt.public-key:}")
    private String publicKeyBase64;

    private PublicKey publicKey;

    /**
     * White list: auth endpoints (now in firefly-system) + actuator health
     * URL convention: /{SHORTNAME}/api/v1/**
     */
    private static final List<String> WHITE_LIST = List.of(
            "/SYSTEM/api/v1/auth/login",
            "/SYSTEM/api/v1/auth/sms/send",
            "/SYSTEM/api/v1/auth/sms/login",
            "/SYSTEM/api/v1/auth/refresh",
            "/SYSTEM/api/v1/auth/wechat-mini",
            "/SYSTEM/api/v1/auth/wechat",
            "/SYSTEM/api/v1/auth/alipay",
            "/SYSTEM/api/v1/auth/apple",
            "/SYSTEM/api/v1/auth/dingtalk",
            "/SYSTEM/api/v1/auth/sso",
            "/SYSTEM/api/v1/auth/qrcode",
            "/SYSTEM/api/v1/auth/.well-known/jwks.json",
            "/CONNECTOR/api/v1/lorawan/webhook",
            "/actuator/health"
    );

    public AuthGlobalFilter(ReactiveStringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @PostConstruct
    public void init() {
        if (publicKeyBase64 != null && !publicKeyBase64.isBlank()) {
            try {
                byte[] keyBytes = Base64.getDecoder().decode(publicKeyBase64);
                X509EncodedKeySpec spec = new X509EncodedKeySpec(keyBytes);
                KeyFactory kf = KeyFactory.getInstance("RSA");
                this.publicKey = kf.generatePublic(spec);
                log.info("JWT public key loaded for gateway");
            } catch (Exception e) {
                log.warn("Failed to load JWT public key, token validation will be skipped in dev mode: {}", e.getMessage());
            }
        } else {
            log.warn("No JWT public key configured, gateway running in dev/passthrough mode");
        }
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getPath().value();

        // Whitelist check
        for (String white : WHITE_LIST) {
            if (path.startsWith(white)) {
                return chain.filter(exchange);
            }
        }

        // Extract token
        String authHeader = request.getHeaders().getFirst(AuthConstants.HEADER_AUTHORIZATION);
        if (authHeader == null || !authHeader.startsWith(AuthConstants.TOKEN_PREFIX)) {
            return unauthorized(exchange);
        }

        String token = authHeader.substring(AuthConstants.TOKEN_PREFIX.length());

        // Dev mode: parse payload without signature verification so downstream
        // services can still receive user/tenant context headers.
        if (publicKey == null) {
            JwtContext jwtContext = parseJwtPayload(token);
            if (jwtContext == null || jwtContext.userId() == null || jwtContext.userId().isBlank()) {
                return unauthorized(exchange);
            }
            return validateAndForward(exchange, chain, token, jwtContext.userId(), jwtContext.tenantId(),
                    jwtContext.platform(), jwtContext.issuedAtEpoch());
        }

        // Parse JWT
        Claims claims;
        try {
            claims = Jwts.parser()
                    .verifyWith(publicKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (Exception e) {
            log.debug("JWT parse failed: {}", e.getMessage());
            return unauthorized(exchange);
        }

        String userId = claims.getSubject();
        String tenantId = claims.get(AuthConstants.JWT_CLAIM_TENANT_ID, String.class);
        String platform = claims.get(AuthConstants.JWT_CLAIM_PLATFORM, String.class);
        Long issuedAtEpoch = claims.getIssuedAt() == null ? null : claims.getIssuedAt().toInstant().getEpochSecond();
        return validateAndForward(exchange, chain, token, userId, tenantId, platform, issuedAtEpoch);
    }

    private Mono<Void> validateAndForward(ServerWebExchange exchange, GatewayFilterChain chain,
                                          String token, String userId, String tenantId, String platform,
                                          Long issuedAtEpoch) {
        return redisTemplate.hasKey(AuthConstants.REDIS_TOKEN_BLACKLIST + sha256(token))
                .flatMap(blacklisted -> {
                    if (Boolean.TRUE.equals(blacklisted)) {
                        return unauthorized(exchange);
                    }
                    // Check revoke-before when iat is available.
                    return redisTemplate.opsForValue()
                            .get(AuthConstants.REDIS_TOKEN_REVOKE_BEFORE + userId)
                            .flatMap(revokeTs -> {
                                if (issuedAtEpoch != null) {
                                    try {
                                        if (Long.parseLong(revokeTs) > issuedAtEpoch) {
                                            return unauthorized(exchange);
                                        }
                                    } catch (NumberFormatException ignored) {
                                        // Ignore malformed revoke marker in cache.
                                    }
                                }
                                return forwardWithHeaders(exchange, chain, userId, tenantId, platform);
                            })
                            .switchIfEmpty(forwardWithHeaders(exchange, chain, userId, tenantId, platform));
                });
    }

    private JwtContext parseJwtPayload(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length < 2) {
                return null;
            }
            byte[] payloadBytes = Base64.getUrlDecoder().decode(parts[1]);
            @SuppressWarnings("unchecked")
            Map<String, Object> payload = new com.fasterxml.jackson.databind.ObjectMapper()
                    .readValue(payloadBytes, Map.class);

            String userId = stringify(payload.get("sub"));
            String tenantId = stringify(payload.get(AuthConstants.JWT_CLAIM_TENANT_ID));
            String platform = stringify(payload.get(AuthConstants.JWT_CLAIM_PLATFORM));
            Long issuedAtEpoch = toEpochSecond(payload.get("iat"));
            return new JwtContext(userId, tenantId, platform, issuedAtEpoch);
        } catch (Exception e) {
            log.debug("Failed to parse JWT payload in dev mode: {}", e.getMessage());
            return null;
        }
    }

    private String stringify(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private Long toEpochSecond(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Mono<Void> forwardWithHeaders(ServerWebExchange exchange, GatewayFilterChain chain,
                                          String userId, String tenantId, String platform) {
        ServerHttpRequest mutated = exchange.getRequest().mutate()
                .header(AuthConstants.HEADER_USER_ID, userId)
                .header(AuthConstants.HEADER_TENANT_ID, tenantId)
                .header(AuthConstants.HEADER_PLATFORM, platform != null ? platform : "")
                .build();
        return chain.filter(exchange.mutate().request(mutated).build());
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange) {
        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
        return exchange.getResponse().setComplete();
    }

    private String sha256(String input) {
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            return "";
        }
    }

    private record JwtContext(String userId, String tenantId, String platform, Long issuedAtEpoch) {
    }

    @Override
    public int getOrder() {
        return -100;
    }
}
