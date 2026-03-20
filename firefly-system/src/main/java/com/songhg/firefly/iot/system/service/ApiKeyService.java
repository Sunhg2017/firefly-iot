package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.ApiKeyStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.convert.ApiKeyConvert;
import com.songhg.firefly.iot.system.dto.apikey.ApiKeyCreateDTO;
import com.songhg.firefly.iot.system.dto.apikey.ApiKeyCreatedVO;
import com.songhg.firefly.iot.system.dto.apikey.ApiKeyQueryDTO;
import com.songhg.firefly.iot.system.dto.apikey.ApiKeyUpdateDTO;
import com.songhg.firefly.iot.system.dto.apikey.ApiKeyVO;
import com.songhg.firefly.iot.system.dto.openapi.InternalOpenApiAuthRequest;
import com.songhg.firefly.iot.system.dto.openapi.InternalOpenApiAuthVO;
import com.songhg.firefly.iot.system.dto.openapi.OpenApiOptionVO;
import com.songhg.firefly.iot.system.entity.ApiKey;
import com.songhg.firefly.iot.system.entity.OpenApiCatalog;
import com.songhg.firefly.iot.system.entity.TenantOpenApiSubscription;
import com.songhg.firefly.iot.system.mapper.ApiKeyMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class ApiKeyService {

    private static final int MAX_KEYS_PER_TENANT = 50;
    private static final int DEFAULT_RATE_LIMIT_PER_MIN = 600;
    private static final int DEFAULT_RATE_LIMIT_PER_DAY = 100000;
    private static final String AK_PREFIX = "ak_";
    private static final String SK_PREFIX = "sk_";
    private static final String CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final ApiKeyMapper apiKeyMapper;
    private final ObjectMapper objectMapper;
    private final OpenApiCatalogService openApiCatalogService;
    private final TenantOpenApiSubscriptionService tenantOpenApiSubscriptionService;
    private final AppKeySecretCryptoService appKeySecretCryptoService;

    @Value("${firefly.openapi.appkey.signature-window-seconds:300}")
    private long signatureWindowSeconds;

    @Transactional
    public ApiKeyCreatedVO createApiKey(ApiKeyCreateDTO dto) {
        Long tenantId = requireTenantId();
        Long userId = AppContextHolder.getUserId();

        Long count = apiKeyMapper.selectCount(new LambdaQueryWrapper<ApiKey>()
                .eq(ApiKey::getTenantId, tenantId)
                .isNull(ApiKey::getDeletedAt));
        if (count != null && count >= MAX_KEYS_PER_TENANT) {
            throw new BizException(ResultCode.QUOTA_EXCEEDED);
        }

        String accessKey = AK_PREFIX + randomString(32);
        String secretKey = SK_PREFIX + randomString(48);
        List<String> openApiCodes = normalizeOpenApiCodes(tenantId, dto.getOpenApiCodes());

        ApiKey entity = new ApiKey();
        entity.setTenantId(tenantId);
        entity.setName(normalizeName(dto.getName()));
        entity.setDescription(trimToNull(dto.getDescription()));
        entity.setAccessKey(accessKey);
        entity.setSecretKeyHash(sha256Hex(secretKey));
        entity.setSecretKeyCiphertext(appKeySecretCryptoService.encrypt(secretKey));
        entity.setScopes(toJson(openApiCodes));
        entity.setRateLimitPerMin(dto.getRateLimitPerMin() != null ? dto.getRateLimitPerMin() : DEFAULT_RATE_LIMIT_PER_MIN);
        entity.setRateLimitPerDay(dto.getRateLimitPerDay() != null ? dto.getRateLimitPerDay() : DEFAULT_RATE_LIMIT_PER_DAY);
        entity.setStatus(ApiKeyStatus.ACTIVE);
        entity.setExpireAt(dto.getExpireAt());
        entity.setCreatedBy(userId);
        apiKeyMapper.insert(entity);

        ApiKeyCreatedVO vo = new ApiKeyCreatedVO();
        vo.setId(entity.getId());
        vo.setName(entity.getName());
        vo.setAccessKey(accessKey);
        vo.setSecretKey(secretKey);
        vo.setOpenApiCodes(openApiCodes);
        vo.setRateLimitPerMin(entity.getRateLimitPerMin());
        vo.setRateLimitPerDay(entity.getRateLimitPerDay());
        vo.setStatus(entity.getStatus());
        vo.setExpireAt(entity.getExpireAt());
        vo.setCreatedAt(entity.getCreatedAt());
        return vo;
    }

    public ApiKeyVO getApiKeyById(Long id) {
        return toVO(requireCurrentTenantApiKey(id));
    }

    public IPage<ApiKeyVO> listApiKeys(ApiKeyQueryDTO query) {
        Long tenantId = requireTenantId();
        Page<ApiKey> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<ApiKey> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ApiKey::getTenantId, tenantId)
                .isNull(ApiKey::getDeletedAt);
        if (StringUtils.hasText(query.getKeyword())) {
            String keyword = query.getKeyword().trim();
            wrapper.and(item -> item.like(ApiKey::getName, keyword)
                    .or().like(ApiKey::getAccessKey, keyword));
        }
        if (query.getStatus() != null) {
            wrapper.eq(ApiKey::getStatus, query.getStatus());
        }
        wrapper.orderByDesc(ApiKey::getCreatedAt);
        return apiKeyMapper.selectPage(page, wrapper).convert(this::toVO);
    }

    @Transactional
    public ApiKeyVO updateApiKey(Long id, ApiKeyUpdateDTO dto) {
        ApiKey entity = requireCurrentTenantApiKey(id);
        List<String> openApiCodes = normalizeOpenApiCodes(entity.getTenantId(), dto.getOpenApiCodes());
        ApiKeyConvert.INSTANCE.updateEntity(dto, entity);
        entity.setName(normalizeName(dto.getName()));
        entity.setDescription(trimToNull(dto.getDescription()));
        entity.setScopes(toJson(openApiCodes));
        entity.setUpdatedAt(LocalDateTime.now());
        apiKeyMapper.updateById(entity);
        return toVO(entity);
    }

    @Transactional
    public void updateApiKeyStatus(Long id, ApiKeyStatus status) {
        ApiKey entity = requireCurrentTenantApiKey(id);
        entity.setStatus(status);
        entity.setUpdatedAt(LocalDateTime.now());
        apiKeyMapper.updateById(entity);
    }

    @Transactional
    public void deleteApiKey(Long id) {
        ApiKey entity = requireCurrentTenantApiKey(id);
        entity.setStatus(ApiKeyStatus.DELETED);
        entity.setUpdatedAt(LocalDateTime.now());
        apiKeyMapper.updateById(entity);
        apiKeyMapper.deleteById(entity.getId());
        log.info("AppKey deleted: id={}, accessKey={}", id, entity.getAccessKey());
    }

    public List<OpenApiOptionVO> listSubscribedOpenApiOptions() {
        return tenantOpenApiSubscriptionService.listSubscribedEnabledOptions(requireTenantId());
    }

    public InternalOpenApiAuthVO authorizeOpenApiCall(InternalOpenApiAuthRequest request) {
        ApiKey entity = apiKeyMapper.findByAccessKey(trimRequired(request.getAppKey(), "app key is required"));
        if (entity == null || entity.getDeletedAt() != null) {
            throw new BizException(ResultCode.UNAUTHORIZED, "invalid app key");
        }
        if (entity.getStatus() != ApiKeyStatus.ACTIVE) {
            throw new BizException(ResultCode.PERMISSION_DENIED, "app key is disabled");
        }
        if (entity.getExpireAt() != null && entity.getExpireAt().isBefore(LocalDateTime.now())) {
            throw new BizException(ResultCode.PERMISSION_DENIED, "app key is expired");
        }

        verifySignature(entity, request);

        OpenApiCatalog openApi = openApiCatalogService.matchEnabledOpenApi(
                request.getServiceCode(),
                request.getHttpMethod(),
                request.getRequestPath());
        List<String> grantedOpenApiCodes = fromJson(entity.getScopes());
        if (!grantedOpenApiCodes.contains(openApi.getCode())) {
            throw new BizException(ResultCode.PERMISSION_DENIED, "app key is not allowed to call this open api");
        }

        TenantOpenApiSubscription subscription = tenantOpenApiSubscriptionService.requireSubscription(entity.getTenantId(), openApi.getCode());
        if (!isIpAllowed(request.getClientIp(), tenantOpenApiSubscriptionService.getIpWhitelist(subscription))) {
            throw new BizException(ResultCode.PERMISSION_DENIED, "client ip is not in whitelist");
        }

        InternalOpenApiAuthVO vo = new InternalOpenApiAuthVO();
        vo.setTenantId(entity.getTenantId());
        vo.setAppKeyId(entity.getId());
        vo.setOpenApiCode(openApi.getCode());
        vo.setPermissionCode(openApi.getPermissionCode());
        vo.setRateLimitPerMin(entity.getRateLimitPerMin());
        vo.setRateLimitPerDay(entity.getRateLimitPerDay());
        vo.setConcurrencyLimit(subscription.getConcurrencyLimit());
        vo.setSubscriptionDailyLimit(subscription.getDailyLimit());
        return vo;
    }

    private void verifySignature(ApiKey entity, InternalOpenApiAuthRequest request) {
        long timestamp = parseTimestamp(request.getTimestamp());
        long now = Instant.now().toEpochMilli();
        long allowedSkewMillis = Math.max(30, signatureWindowSeconds) * 1000L;
        if (Math.abs(now - timestamp) > allowedSkewMillis) {
            throw new BizException(ResultCode.UNAUTHORIZED, "app key signature expired");
        }

        String nonce = normalizeNonce(request.getNonce());
        String bodySha256 = normalizeSha256(request.getBodySha256(), "request body sha256 is invalid");
        String signature = normalizeSha256(request.getSignature(), "request signature is invalid");
        String canonicalRequest = buildCanonicalRequest(
                request.getServiceCode(),
                request.getHttpMethod(),
                request.getRequestPath(),
                request.getCanonicalQuery(),
                bodySha256,
                String.valueOf(timestamp),
                nonce);
        String secretKey = appKeySecretCryptoService.decrypt(entity.getSecretKeyCiphertext());
        // Keep the secret hash as a server-side fingerprint so tampered or stale ciphertext
        // is rejected before it can be used for HMAC verification.
        String secretFingerprint = normalizeSha256(entity.getSecretKeyHash(), "app key secret fingerprint is invalid");
        if (!MessageDigest.isEqual(
                secretFingerprint.getBytes(StandardCharsets.UTF_8),
                sha256Hex(secretKey).getBytes(StandardCharsets.UTF_8))) {
            throw new BizException(ResultCode.UNAUTHORIZED, "app key secret fingerprint mismatch, recreate the app key");
        }
        String expectedSignature = hmacSha256Hex(secretKey, canonicalRequest);
        if (!MessageDigest.isEqual(
                expectedSignature.getBytes(StandardCharsets.UTF_8),
                signature.getBytes(StandardCharsets.UTF_8))) {
            throw new BizException(ResultCode.UNAUTHORIZED, "invalid app key signature");
        }
    }

    private String buildCanonicalRequest(
            String serviceCode,
            String httpMethod,
            String requestPath,
            String canonicalQuery,
            String bodySha256,
            String timestamp,
            String nonce
    ) {
        // The canonical request format is shared with gateway signing input and must remain byte-stable.
        return String.join("\n",
                trimRequired(httpMethod, "http method is required").toUpperCase(Locale.ROOT),
                trimRequired(serviceCode, "service code is required").toUpperCase(Locale.ROOT),
                normalizeRequestPath(requestPath),
                canonicalQuery == null ? "" : canonicalQuery.trim(),
                bodySha256,
                timestamp,
                nonce);
    }

    private String hmacSha256Hex(String secretKey, String content) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secretKey.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            return bytesToHex(mac.doFinal(content.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "failed to verify app key signature");
        }
    }

    private ApiKey requireCurrentTenantApiKey(Long id) {
        ApiKey entity = apiKeyMapper.selectById(id);
        if (entity == null || entity.getDeletedAt() != null || !entity.getTenantId().equals(requireTenantId())) {
            throw new BizException(ResultCode.APIKEY_NOT_FOUND);
        }
        return entity;
    }

    private ApiKeyVO toVO(ApiKey entity) {
        ApiKeyVO vo = ApiKeyConvert.INSTANCE.toVO(entity);
        vo.setOpenApiCodes(fromJson(entity.getScopes()));
        return vo;
    }

    private List<String> normalizeOpenApiCodes(Long tenantId, List<String> requestedCodes) {
        if (requestedCodes == null || requestedCodes.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "please select at least one subscribed open api");
        }
        Set<String> subscribedCodes = tenantOpenApiSubscriptionService.listSubscribedCodes(tenantId);
        if (subscribedCodes.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "tenant has not subscribed any open api");
        }

        Set<String> normalized = new LinkedHashSet<>();
        for (String item : requestedCodes) {
            if (!StringUtils.hasText(item)) {
                continue;
            }
            String code = item.trim();
            if (!subscribedCodes.contains(code)) {
                throw new BizException(ResultCode.PARAM_ERROR, "open api is not subscribed: " + code);
            }
            OpenApiCatalog openApi = openApiCatalogService.requireOpenApi(code);
            if (!Boolean.TRUE.equals(openApi.getEnabled())) {
                throw new BizException(ResultCode.PARAM_ERROR, "open api is disabled: " + code);
            }
            normalized.add(code);
        }
        if (normalized.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "please select at least one subscribed open api");
        }
        return new ArrayList<>(normalized);
    }

    private boolean isIpAllowed(String clientIp, List<String> whitelist) {
        if (whitelist == null || whitelist.isEmpty()) {
            return true;
        }
        if (!StringUtils.hasText(clientIp)) {
            return false;
        }
        String normalizedClientIp = clientIp.trim().toLowerCase(Locale.ROOT);
        for (String item : whitelist) {
            if (!StringUtils.hasText(item)) {
                continue;
            }
            if (normalizedClientIp.equals(item.trim().toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }

    private Long requireTenantId() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "tenant context required");
        }
        return tenantId;
    }

    private String normalizeName(String value) {
        return trimRequired(value, "appKey name is required");
    }

    private long parseTimestamp(String timestamp) {
        String normalized = trimRequired(timestamp, "timestamp is required");
        try {
            return Long.parseLong(normalized);
        } catch (NumberFormatException e) {
            throw new BizException(ResultCode.UNAUTHORIZED, "invalid app key timestamp");
        }
    }

    private String normalizeNonce(String nonce) {
        String normalized = trimRequired(nonce, "nonce is required");
        if (!normalized.matches("^[A-Za-z0-9_-]{8,128}$")) {
            throw new BizException(ResultCode.UNAUTHORIZED, "invalid app key nonce");
        }
        return normalized;
    }

    private String normalizeSha256(String value, String message) {
        String normalized = trimRequired(value, message).toLowerCase(Locale.ROOT);
        if (!normalized.matches("^[a-f0-9]{64}$")) {
            throw new BizException(ResultCode.UNAUTHORIZED, message);
        }
        return normalized;
    }

    private String normalizeRequestPath(String requestPath) {
        String normalized = trimRequired(requestPath, "request path is required");
        return normalized.startsWith("/") ? normalized : "/" + normalized;
    }

    private String trimRequired(String value, String message) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw new BizException(ResultCode.PARAM_ERROR, message);
        }
        return normalized;
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private String toJson(List<String> openApiCodes) {
        try {
            return objectMapper.writeValueAsString(openApiCodes);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    private List<String> fromJson(String json) {
        if (!StringUtils.hasText(json)) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            return Collections.emptyList();
        }
    }

    private String sha256Hex(String content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return bytesToHex(digest.digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "failed to hash app key secret");
        }
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte item : bytes) {
            sb.append(Character.forDigit((item >> 4) & 0xF, 16));
            sb.append(Character.forDigit(item & 0xF, 16));
        }
        return sb.toString();
    }

    private String randomString(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(CHARS.charAt(RANDOM.nextInt(CHARS.length())));
        }
        return sb.toString();
    }
}
