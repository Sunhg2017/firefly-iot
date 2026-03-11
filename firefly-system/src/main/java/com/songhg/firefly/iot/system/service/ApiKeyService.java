package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.ApiKeyStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.convert.ApiKeyConvert;
import com.songhg.firefly.iot.system.dto.apikey.*;
import com.songhg.firefly.iot.system.entity.ApiKey;
import com.songhg.firefly.iot.system.mapper.ApiKeyMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ApiKeyService {

    private final ApiKeyMapper apiKeyMapper;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;

    private static final int MAX_KEYS_PER_TENANT = 50;
    private static final int DEFAULT_RATE_LIMIT_PER_MIN = 600;
    private static final int DEFAULT_RATE_LIMIT_PER_DAY = 100000;
    private static final String AK_PREFIX = "ak_";
    private static final String SK_PREFIX = "sk_";
    private static final String CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    @Transactional
    public ApiKeyCreatedVO createApiKey(ApiKeyCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();

        // 检查配额
        Long count = apiKeyMapper.selectCount(new LambdaQueryWrapper<ApiKey>()
                .eq(ApiKey::getTenantId, tenantId)
                .isNull(ApiKey::getDeletedAt));
        if (count >= MAX_KEYS_PER_TENANT) {
            throw new BizException(ResultCode.QUOTA_EXCEEDED);
        }

        String accessKey = AK_PREFIX + randomString(32);
        String secretKey = SK_PREFIX + randomString(48);

        ApiKey entity = new ApiKey();
        entity.setTenantId(tenantId);
        entity.setName(dto.getName());
        entity.setDescription(dto.getDescription());
        entity.setAccessKey(accessKey);
        entity.setSecretKeyHash(passwordEncoder.encode(secretKey));
        entity.setScopes(toJson(dto.getScopes() != null ? dto.getScopes() : List.of("*")));
        entity.setRateLimitPerMin(dto.getRateLimitPerMin() != null ? dto.getRateLimitPerMin() : DEFAULT_RATE_LIMIT_PER_MIN);
        entity.setRateLimitPerDay(dto.getRateLimitPerDay() != null ? dto.getRateLimitPerDay() : DEFAULT_RATE_LIMIT_PER_DAY);
        entity.setStatus(ApiKeyStatus.ACTIVE);
        entity.setExpireAt(dto.getExpireAt());
        entity.setCreatedBy(userId);
        apiKeyMapper.insert(entity);

        log.info("API Key created: id={}, accessKey={}, tenantId={}", entity.getId(), accessKey, tenantId);

        // 构建返回（含 secretKey，仅此一次）
        ApiKeyCreatedVO vo = new ApiKeyCreatedVO();
        vo.setId(entity.getId());
        vo.setName(entity.getName());
        vo.setAccessKey(accessKey);
        vo.setSecretKey(secretKey);
        vo.setScopes(dto.getScopes() != null ? dto.getScopes() : List.of("*"));
        vo.setRateLimitPerMin(entity.getRateLimitPerMin());
        vo.setRateLimitPerDay(entity.getRateLimitPerDay());
        vo.setStatus(entity.getStatus());
        vo.setExpireAt(entity.getExpireAt());
        vo.setCreatedAt(entity.getCreatedAt());
        return vo;
    }

    public ApiKeyVO getApiKeyById(Long id) {
        ApiKey entity = apiKeyMapper.selectById(id);
        if (entity == null || entity.getDeletedAt() != null) {
            throw new BizException(ResultCode.APIKEY_NOT_FOUND);
        }
        return toVO(entity);
    }

    public IPage<ApiKeyVO> listApiKeys(ApiKeyQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<ApiKey> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<ApiKey> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ApiKey::getTenantId, tenantId);
        wrapper.isNull(ApiKey::getDeletedAt);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.and(w -> w.like(ApiKey::getName, query.getKeyword())
                    .or().like(ApiKey::getAccessKey, query.getKeyword()));
        }
        if (query.getStatus() != null) {
            wrapper.eq(ApiKey::getStatus, query.getStatus());
        }
        wrapper.orderByDesc(ApiKey::getCreatedAt);

        IPage<ApiKey> result = apiKeyMapper.selectPage(page, wrapper);
        return result.convert(this::toVO);
    }

    @Transactional
    public ApiKeyVO updateApiKey(Long id, ApiKeyUpdateDTO dto) {
        ApiKey entity = apiKeyMapper.selectById(id);
        if (entity == null || entity.getDeletedAt() != null) {
            throw new BizException(ResultCode.APIKEY_NOT_FOUND);
        }
        ApiKeyConvert.INSTANCE.updateEntity(dto, entity);
        if (dto.getScopes() != null) {
            entity.setScopes(toJson(dto.getScopes()));
        }
        entity.setUpdatedAt(LocalDateTime.now());
        apiKeyMapper.updateById(entity);

        return toVO(entity);
    }

    @Transactional
    public void updateApiKeyStatus(Long id, ApiKeyStatus status) {
        ApiKey entity = apiKeyMapper.selectById(id);
        if (entity == null || entity.getDeletedAt() != null) {
            throw new BizException(ResultCode.APIKEY_NOT_FOUND);
        }
        entity.setStatus(status);
        entity.setUpdatedAt(LocalDateTime.now());
        apiKeyMapper.updateById(entity);
    }

    @Transactional
    public void deleteApiKey(Long id) {
        ApiKey entity = apiKeyMapper.selectById(id);
        if (entity == null || entity.getDeletedAt() != null) {
            throw new BizException(ResultCode.APIKEY_NOT_FOUND);
        }
        entity.setDeletedAt(LocalDateTime.now());
        entity.setStatus(ApiKeyStatus.DELETED);
        apiKeyMapper.updateById(entity);
        log.info("API Key deleted: id={}, accessKey={}", id, entity.getAccessKey());
    }

    private ApiKeyVO toVO(ApiKey entity) {
        ApiKeyVO vo = ApiKeyConvert.INSTANCE.toVO(entity);
        vo.setScopes(fromJson(entity.getScopes()));
        return vo;
    }

    private String toJson(List<String> scopes) {
        try {
            return objectMapper.writeValueAsString(scopes);
        } catch (JsonProcessingException e) {
            return "[\"*\"]";
        }
    }

    private List<String> fromJson(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            return Collections.emptyList();
        }
    }

    private String randomString(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(CHARS.charAt(RANDOM.nextInt(CHARS.length())));
        }
        return sb.toString();
    }
}
