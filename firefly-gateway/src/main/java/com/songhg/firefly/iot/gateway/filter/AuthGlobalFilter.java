package com.songhg.firefly.iot.gateway.filter;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.songhg.firefly.iot.common.constant.AuthConstants;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpRequestDecorator;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Component
@RequiredArgsConstructor
public class AuthGlobalFilter implements GlobalFilter, Ordered {

    private static final String OPEN_API_GATEWAY_PREFIX = "/open/";

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

    private final ReactiveStringRedisTemplate redisTemplate;
    private final WebClient.Builder webClientBuilder;

    @Value("${auth.jwt.public-key:}")
    private String publicKeyBase64;

    @Value("${firefly.openapi.appkey.signature-window-seconds:300}")
    private long signatureWindowSeconds;

    private PublicKey publicKey;

    @PostConstruct
    public void init() {
        if (!StringUtils.hasText(publicKeyBase64)) {
            log.warn("No JWT public key configured, gateway running in dev/passthrough mode");
            return;
        }
        try {
            byte[] keyBytes = Base64.getDecoder().decode(publicKeyBase64);
            X509EncodedKeySpec spec = new X509EncodedKeySpec(keyBytes);
            KeyFactory kf = KeyFactory.getInstance("RSA");
            this.publicKey = kf.generatePublic(spec);
            log.info("JWT public key loaded for gateway");
        } catch (Exception e) {
            log.warn("Failed to load JWT public key, token validation will be skipped in dev mode: {}", e.getMessage());
        }
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getPath().value();

        for (String white : WHITE_LIST) {
            if (path.startsWith(white)) {
                return chain.filter(exchange);
            }
        }

        if (isOpenApiGatewayPath(path)) {
            String appKey = request.getHeaders().getFirst(AuthConstants.HEADER_APP_KEY);
            String timestamp = request.getHeaders().getFirst(AuthConstants.HEADER_APP_TIMESTAMP);
            String nonce = request.getHeaders().getFirst(AuthConstants.HEADER_APP_NONCE);
            String signature = request.getHeaders().getFirst(AuthConstants.HEADER_APP_SIGNATURE);
            return authenticateAppKey(exchange, chain, path, appKey, timestamp, nonce, signature);
        }

        String authHeader = request.getHeaders().getFirst(AuthConstants.HEADER_AUTHORIZATION);
        if (StringUtils.hasText(authHeader) && authHeader.startsWith(AuthConstants.TOKEN_PREFIX)) {
            return authenticateJwt(exchange, chain, authHeader.substring(AuthConstants.TOKEN_PREFIX.length()));
        }

        return unauthorized(exchange);
    }

    private Mono<Void> authenticateJwt(ServerWebExchange exchange, GatewayFilterChain chain, String token) {
        if (publicKey == null) {
            JwtContext jwtContext = parseJwtPayload(token);
            if (jwtContext == null || !StringUtils.hasText(jwtContext.userId())) {
                return unauthorized(exchange);
            }
            return validateAndForwardJwt(exchange, chain, token, jwtContext.userId(), jwtContext.tenantId(),
                    jwtContext.platform(), jwtContext.issuedAtEpoch());
        }

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
        return validateAndForwardJwt(exchange, chain, token, userId, tenantId, platform, issuedAtEpoch);
    }

    private Mono<Void> validateAndForwardJwt(ServerWebExchange exchange, GatewayFilterChain chain,
                                             String token, String userId, String tenantId, String platform,
                                             Long issuedAtEpoch) {
        return redisTemplate.hasKey(AuthConstants.REDIS_TOKEN_BLACKLIST + sha256(token))
                .flatMap(blacklisted -> {
                    if (Boolean.TRUE.equals(blacklisted)) {
                        return unauthorized(exchange);
                    }
                    return redisTemplate.opsForValue()
                            .get(AuthConstants.REDIS_TOKEN_REVOKE_BEFORE + userId)
                            .flatMap(revokeTs -> {
                                if (issuedAtEpoch != null) {
                                    try {
                                        if (Long.parseLong(revokeTs) > issuedAtEpoch) {
                                            return unauthorized(exchange);
                                        }
                                    } catch (NumberFormatException ignored) {
                                        // ignore malformed marker
                                    }
                                }
                                return forwardWithJwtHeaders(exchange, chain, userId, tenantId, platform);
                            })
                            .switchIfEmpty(forwardWithJwtHeaders(exchange, chain, userId, tenantId, platform));
                });
    }

    private Mono<Void> authenticateAppKey(ServerWebExchange exchange,
                                          GatewayFilterChain chain,
                                          String path,
                                          String appKey,
                                          String timestamp,
                                          String nonce,
                                          String signature) {
        ServiceRequest serviceRequest = resolveServiceRequest(path);
        if (serviceRequest == null) {
            return forbidden(exchange);
        }
        if (!StringUtils.hasText(appKey)
                || !StringUtils.hasText(timestamp)
                || !StringUtils.hasText(nonce)
                || !StringUtils.hasText(signature)) {
            return unauthorized(exchange);
        }
        if (!isTimestampFresh(timestamp)) {
            return unauthorized(exchange);
        }

        // Gateway and system-service must hash the exact same raw body bytes,
        // so we cache the body once and forward the cached request downstream.
        return cacheRequestBody(exchange)
                .flatMap(cachedRequest -> {
                    ServerWebExchange cachedExchange = exchange.mutate().request(cachedRequest.request()).build();

                    InternalOpenApiAuthRequest authRequest = new InternalOpenApiAuthRequest();
                    authRequest.setAppKey(appKey.trim());
                    authRequest.setTimestamp(timestamp.trim());
                    authRequest.setNonce(nonce.trim());
                    authRequest.setSignature(signature.trim());
                    authRequest.setServiceCode(serviceRequest.serviceCode());
                    authRequest.setHttpMethod(cachedExchange.getRequest().getMethod() == null
                            ? "GET"
                            : cachedExchange.getRequest().getMethod().name());
                    authRequest.setRequestPath(serviceRequest.requestPath());
                    authRequest.setCanonicalQuery(buildCanonicalQuery(cachedExchange.getRequest()));
                    authRequest.setBodySha256(sha256(cachedRequest.bodyBytes()));
                    authRequest.setClientIp(resolveClientIp(cachedExchange.getRequest()));

                    return webClientBuilder.build()
                            .post()
                            .uri("http://firefly-system/api/v1/internal/open-apis/authorize")
                            .bodyValue(authRequest)
                            .retrieve()
                            .bodyToMono(InternalResponse.class)
                            .flatMap(response -> handleInternalAuthResponse(cachedExchange, chain, response, nonce.trim()))
                            .onErrorResume(error -> {
                                log.error("OpenAPI appKey authorization failed", error);
                                return serviceUnavailable(cachedExchange);
                            });
                });
    }

    private Mono<Void> handleInternalAuthResponse(ServerWebExchange exchange,
                                                  GatewayFilterChain chain,
                                                  InternalResponse<?> response,
                                                  String nonce) {
        if (response == null) {
            return serviceUnavailable(exchange);
        }
        if (response.getCode() != 0 || !(response.getData() instanceof Map<?, ?> payloadMap)) {
            return mapInternalFailure(exchange, response.getCode());
        }

        GatewayAuthPayload payload = GatewayAuthPayload.fromMap(payloadMap);
        return reserveNonce(payload.appKeyId(), nonce)
                .then(acquireLimits(payload))
                .flatMap(limitContext -> forwardWithAppKeyHeaders(exchange, chain, payload)
                        .doFinally(signalType -> limitContext.release().subscribe()))
                .onErrorResume(LimitExceededException.class, error -> tooManyRequests(exchange))
                .onErrorResume(ReplayAttackException.class, error -> unauthorized(exchange));
    }

    private Mono<LimitContext> acquireLimits(GatewayAuthPayload payload) {
        LimitContext context = new LimitContext(redisTemplate, payload.tenantId(), payload.appKeyId(), payload.openApiCode());
        return context.acquireConcurrency(payload.concurrencyLimit())
                .then(context.reserveLimit("minute", payload.rateLimitPerMin(), ttlToNextMinute()))
                .then(context.reserveLimit("appkey-day", payload.rateLimitPerDay(), ttlToNextDay()))
                .then(context.reserveLimit("subscription-day", payload.subscriptionDailyLimit(), ttlToNextDay()))
                .thenReturn(context);
    }

    private Mono<Void> reserveNonce(Long appKeyId, String nonce) {
        if (appKeyId == null || !StringUtils.hasText(nonce)) {
            return Mono.error(new ReplayAttackException());
        }
        Duration ttl = Duration.ofSeconds(Math.max(30, signatureWindowSeconds));
        String key = AuthConstants.REDIS_OPEN_API_NONCE + appKeyId + ":" + nonce;
        return redisTemplate.opsForValue()
                .setIfAbsent(key, "1", ttl)
                .flatMap(saved -> Boolean.TRUE.equals(saved) ? Mono.empty() : Mono.error(new ReplayAttackException()));
    }

    private Mono<Void> forwardWithJwtHeaders(ServerWebExchange exchange, GatewayFilterChain chain,
                                             String userId, String tenantId, String platform) {
        ServerHttpRequest mutated = exchange.getRequest().mutate()
                .header(AuthConstants.HEADER_USER_ID, userId)
                .header(AuthConstants.HEADER_TENANT_ID, tenantId)
                .header(AuthConstants.HEADER_PLATFORM, StringUtils.hasText(platform) ? platform : "")
                .build();
        return chain.filter(exchange.mutate().request(mutated).build());
    }

    private Mono<Void> forwardWithAppKeyHeaders(ServerWebExchange exchange, GatewayFilterChain chain,
                                                GatewayAuthPayload payload) {
        ServerHttpRequest.Builder builder = exchange.getRequest().mutate()
                .headers(headers -> {
                    // Signature material is only for gateway verification and must not leak downstream.
                    headers.remove(AuthConstants.HEADER_APP_KEY);
                    headers.remove(AuthConstants.HEADER_APP_TIMESTAMP);
                    headers.remove(AuthConstants.HEADER_APP_NONCE);
                    headers.remove(AuthConstants.HEADER_APP_SIGNATURE);
                })
                .header(AuthConstants.HEADER_TENANT_ID, String.valueOf(payload.tenantId()))
                .header(AuthConstants.HEADER_PLATFORM, AuthConstants.PLATFORM_OPEN_API)
                .header(AuthConstants.HEADER_APP_KEY_ID, String.valueOf(payload.appKeyId()))
                .header(AuthConstants.HEADER_OPEN_API_CODE, payload.openApiCode());
        if (StringUtils.hasText(payload.permissionCode())) {
            builder.header(AuthConstants.HEADER_GRANTED_PERMISSIONS, payload.permissionCode());
        }
        return chain.filter(exchange.mutate().request(builder.build()).build());
    }

    private Mono<CachedRequestBody> cacheRequestBody(ServerWebExchange exchange) {
        return DataBufferUtils.join(exchange.getRequest().getBody())
                .defaultIfEmpty(exchange.getResponse().bufferFactory().wrap(new byte[0]))
                .map(dataBuffer -> {
                    byte[] bodyBytes = new byte[dataBuffer.readableByteCount()];
                    dataBuffer.read(bodyBytes);
                    DataBufferUtils.release(dataBuffer);

                    ServerHttpRequest decorated = new ServerHttpRequestDecorator(exchange.getRequest()) {
                        @Override
                        public HttpHeaders getHeaders() {
                            HttpHeaders headers = new HttpHeaders();
                            headers.putAll(super.getHeaders());
                            if (bodyBytes.length > 0) {
                                headers.setContentLength(bodyBytes.length);
                            } else {
                                headers.remove(HttpHeaders.CONTENT_LENGTH);
                            }
                            return headers;
                        }

                        @Override
                        public Flux<DataBuffer> getBody() {
                            return Flux.defer(() -> Mono.just(exchange.getResponse().bufferFactory().wrap(bodyBytes)));
                        }
                    };
                    return new CachedRequestBody(decorated, bodyBytes);
                });
    }

    private String buildCanonicalQuery(ServerHttpRequest request) {
        return request.getQueryParams().entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .flatMap(entry -> {
                    List<String> values = entry.getValue() == null || entry.getValue().isEmpty()
                            ? List.of("")
                            : new ArrayList<>(entry.getValue());
                    values.sort(String::compareTo);
                    return values.stream()
                            .map(value -> rfc3986Encode(entry.getKey()) + "=" + rfc3986Encode(value == null ? "" : value));
                })
                .collect(Collectors.joining("&"));
    }

    private String rfc3986Encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8)
                .replace("+", "%20")
                .replace("*", "%2A")
                .replace("%7E", "~");
    }

    private ServiceRequest resolveServiceRequest(String gatewayPath) {
        if (!StringUtils.hasText(gatewayPath) || !gatewayPath.startsWith("/")) {
            return null;
        }
        String[] parts = gatewayPath.split("/", 5);
        if (parts.length < 4
                || !"open".equalsIgnoreCase(parts[1])
                || !StringUtils.hasText(parts[2])
                || !"api".equalsIgnoreCase(parts[3])) {
            return null;
        }
        String serviceCode = parts[2].toUpperCase(Locale.ROOT);
        String requestPath = parts.length >= 5 ? "/api/" + parts[4] : "/api";
        return new ServiceRequest(serviceCode, requestPath);
    }

    private boolean isOpenApiGatewayPath(String path) {
        return StringUtils.hasText(path) && path.startsWith(OPEN_API_GATEWAY_PREFIX);
    }

    private JwtContext parseJwtPayload(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length < 2) {
                return null;
            }
            byte[] payloadBytes = Base64.getUrlDecoder().decode(parts[1]);
            @SuppressWarnings("unchecked")
            Map<String, Object> payload = new com.fasterxml.jackson.databind.ObjectMapper().readValue(payloadBytes, Map.class);
            String userId = payload.get("sub") == null ? null : String.valueOf(payload.get("sub"));
            String tenantId = payload.get(AuthConstants.JWT_CLAIM_TENANT_ID) == null ? null : String.valueOf(payload.get(AuthConstants.JWT_CLAIM_TENANT_ID));
            String platform = payload.get(AuthConstants.JWT_CLAIM_PLATFORM) == null ? null : String.valueOf(payload.get(AuthConstants.JWT_CLAIM_PLATFORM));
            Long issuedAtEpoch = null;
            Object issuedAt = payload.get("iat");
            if (issuedAt instanceof Number number) {
                issuedAtEpoch = number.longValue();
            } else if (issuedAt != null) {
                issuedAtEpoch = Long.parseLong(String.valueOf(issuedAt));
            }
            return new JwtContext(userId, tenantId, platform, issuedAtEpoch);
        } catch (Exception e) {
            log.debug("Failed to parse JWT payload in dev mode: {}", e.getMessage());
            return null;
        }
    }

    private String resolveClientIp(ServerHttpRequest request) {
        String forwarded = request.getHeaders().getFirst("X-Forwarded-For");
        if (StringUtils.hasText(forwarded)) {
            int commaIndex = forwarded.indexOf(',');
            return commaIndex > 0 ? forwarded.substring(0, commaIndex).trim() : forwarded.trim();
        }
        if (request.getRemoteAddress() == null || request.getRemoteAddress().getAddress() == null) {
            return null;
        }
        return request.getRemoteAddress().getAddress().getHostAddress();
    }

    private boolean isTimestampFresh(String timestampValue) {
        try {
            long timestamp = Long.parseLong(timestampValue.trim());
            long delta = Math.abs(Instant.now().toEpochMilli() - timestamp);
            return delta <= Math.max(30, signatureWindowSeconds) * 1000L;
        } catch (Exception e) {
            return false;
        }
    }

    private Duration ttlToNextMinute() {
        LocalDateTime nextMinute = LocalDateTime.now().withSecond(0).withNano(0).plusMinutes(1);
        return Duration.ofSeconds(Math.max(1, nextMinute.toEpochSecond(ZoneOffset.UTC) - LocalDateTime.now().toEpochSecond(ZoneOffset.UTC)));
    }

    private Duration ttlToNextDay() {
        LocalDateTime nextDay = LocalDate.now().plusDays(1).atStartOfDay();
        return Duration.ofSeconds(Math.max(1, nextDay.toEpochSecond(ZoneOffset.UTC) - LocalDateTime.now().toEpochSecond(ZoneOffset.UTC)));
    }

    private Mono<Void> mapInternalFailure(ServerWebExchange exchange, int code) {
        if (code == 1001 || code == 1002) {
            return unauthorized(exchange);
        }
        if (code == 1004) {
            return notFound(exchange);
        }
        if (code == 5006) {
            return forbidden(exchange);
        }
        if (code == 4001) {
            return tooManyRequests(exchange);
        }
        return forbidden(exchange);
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange) {
        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
        return exchange.getResponse().setComplete();
    }

    private Mono<Void> forbidden(ServerWebExchange exchange) {
        exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
        return exchange.getResponse().setComplete();
    }

    private Mono<Void> notFound(ServerWebExchange exchange) {
        exchange.getResponse().setStatusCode(HttpStatus.NOT_FOUND);
        return exchange.getResponse().setComplete();
    }

    private Mono<Void> tooManyRequests(ServerWebExchange exchange) {
        exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
        return exchange.getResponse().setComplete();
    }

    private Mono<Void> serviceUnavailable(ServerWebExchange exchange) {
        exchange.getResponse().setStatusCode(HttpStatus.SERVICE_UNAVAILABLE);
        return exchange.getResponse().setComplete();
    }

    private String sha256(String input) {
        return sha256(input.getBytes(StandardCharsets.UTF_8));
    }

    private String sha256(byte[] input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(input));
        } catch (Exception e) {
            return "";
        }
    }

    @Override
    public int getOrder() {
        return -100;
    }

    private record JwtContext(String userId, String tenantId, String platform, Long issuedAtEpoch) {
    }

    private record ServiceRequest(String serviceCode, String requestPath) {
    }

    private record CachedRequestBody(ServerHttpRequest request, byte[] bodyBytes) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class InternalResponse<T> {
        private int code;
        private String message;
        private T data;

        public int getCode() {
            return code;
        }

        public void setCode(int code) {
            this.code = code;
        }

        public String getMessage() {
            return message;
        }

        public void setMessage(String message) {
            this.message = message;
        }

        public T getData() {
            return data;
        }

        public void setData(T data) {
            this.data = data;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class InternalOpenApiAuthRequest {
        private String appKey;
        private String timestamp;
        private String nonce;
        private String signature;
        private String serviceCode;
        private String httpMethod;
        private String requestPath;
        private String canonicalQuery;
        private String bodySha256;
        private String clientIp;

        public String getAppKey() {
            return appKey;
        }

        public void setAppKey(String appKey) {
            this.appKey = appKey;
        }

        public String getTimestamp() {
            return timestamp;
        }

        public void setTimestamp(String timestamp) {
            this.timestamp = timestamp;
        }

        public String getNonce() {
            return nonce;
        }

        public void setNonce(String nonce) {
            this.nonce = nonce;
        }

        public String getSignature() {
            return signature;
        }

        public void setSignature(String signature) {
            this.signature = signature;
        }

        public String getServiceCode() {
            return serviceCode;
        }

        public void setServiceCode(String serviceCode) {
            this.serviceCode = serviceCode;
        }

        public String getHttpMethod() {
            return httpMethod;
        }

        public void setHttpMethod(String httpMethod) {
            this.httpMethod = httpMethod;
        }

        public String getRequestPath() {
            return requestPath;
        }

        public void setRequestPath(String requestPath) {
            this.requestPath = requestPath;
        }

        public String getCanonicalQuery() {
            return canonicalQuery;
        }

        public void setCanonicalQuery(String canonicalQuery) {
            this.canonicalQuery = canonicalQuery;
        }

        public String getBodySha256() {
            return bodySha256;
        }

        public void setBodySha256(String bodySha256) {
            this.bodySha256 = bodySha256;
        }

        public String getClientIp() {
            return clientIp;
        }

        public void setClientIp(String clientIp) {
            this.clientIp = clientIp;
        }
    }

    private record GatewayAuthPayload(
            Long tenantId,
            Long appKeyId,
            String openApiCode,
            String permissionCode,
            Integer rateLimitPerMin,
            Integer rateLimitPerDay,
            Integer concurrencyLimit,
            Long subscriptionDailyLimit
    ) {
        private static GatewayAuthPayload fromMap(Map<?, ?> data) {
            return new GatewayAuthPayload(
                    toLong(data.get("tenantId")),
                    toLong(data.get("appKeyId")),
                    toStringValue(data.get("openApiCode")),
                    toStringValue(data.get("permissionCode")),
                    toInteger(data.get("rateLimitPerMin")),
                    toInteger(data.get("rateLimitPerDay")),
                    toInteger(data.get("concurrencyLimit")),
                    toLong(data.get("subscriptionDailyLimit")));
        }

        private static Long toLong(Object value) {
            if (value instanceof Number number) {
                return number.longValue();
            }
            return value == null ? null : Long.parseLong(String.valueOf(value));
        }

        private static Integer toInteger(Object value) {
            if (value instanceof Number number) {
                return number.intValue();
            }
            return value == null ? null : Integer.parseInt(String.valueOf(value));
        }

        private static String toStringValue(Object value) {
            return value == null ? null : String.valueOf(value);
        }
    }

    private static final class LimitContext {
        private final ReactiveStringRedisTemplate redisTemplate;
        private final Long tenantId;
        private final Long appKeyId;
        private final String openApiCode;
        private String concurrencyKey;
        private boolean concurrencyAcquired;

        private LimitContext(ReactiveStringRedisTemplate redisTemplate, Long tenantId, Long appKeyId, String openApiCode) {
            this.redisTemplate = redisTemplate;
            this.tenantId = tenantId;
            this.appKeyId = appKeyId;
            this.openApiCode = openApiCode;
        }

        private Mono<Void> acquireConcurrency(Integer concurrencyLimit) {
            if (concurrencyLimit == null || concurrencyLimit < 0) {
                return Mono.empty();
            }
            this.concurrencyKey = "openapi:concurrent:" + tenantId + ":" + openApiCode;
            return redisTemplate.opsForValue().increment(concurrencyKey)
                    .flatMap(current -> {
                        if (current != null && current == 1L) {
                            return redisTemplate.expire(concurrencyKey, Duration.ofDays(1)).thenReturn(current);
                        }
                        return Mono.just(current);
                    })
                    .flatMap(current -> {
                        if (current != null && current > concurrencyLimit) {
                            return redisTemplate.opsForValue().decrement(concurrencyKey)
                                    .then(Mono.error(new LimitExceededException()));
                        }
                        concurrencyAcquired = true;
                        return Mono.empty();
                    });
        }

        private Mono<Void> reserveLimit(String scope, Number limit, Duration ttl) {
            long normalizedLimit = limit == null ? -1L : limit.longValue();
            if (normalizedLimit < 0) {
                return Mono.empty();
            }
            String key = switch (scope) {
                case "minute" -> "openapi:quota:appkey:minute:" + appKeyId + ":" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmm"));
                case "appkey-day" -> "openapi:quota:appkey:day:" + appKeyId + ":" + LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
                case "subscription-day" -> "openapi:quota:tenant:day:" + tenantId + ":" + openApiCode + ":" + LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
                default -> throw new IllegalArgumentException("unsupported scope");
            };
            return redisTemplate.opsForValue().increment(key)
                    .flatMap(current -> {
                        if (current != null && current == 1L) {
                            return redisTemplate.expire(key, ttl).thenReturn(current);
                        }
                        return Mono.just(current);
                    })
                    .flatMap(current -> {
                        if (current != null && current > normalizedLimit) {
                            return redisTemplate.opsForValue().decrement(key)
                                    .then(Mono.error(new LimitExceededException()));
                        }
                        return Mono.empty();
                    });
        }

        private Mono<Void> release() {
            if (!concurrencyAcquired || !StringUtils.hasText(concurrencyKey)) {
                return Mono.empty();
            }
            concurrencyAcquired = false;
            return redisTemplate.opsForValue().decrement(concurrencyKey).then();
        }
    }

    private static final class LimitExceededException extends RuntimeException {
    }

    private static final class ReplayAttackException extends RuntimeException {
    }
}
