package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.dto.openapi.OpenApiOptionVO;
import com.songhg.firefly.iot.system.dto.openapi.TenantOpenApiSubscriptionItemDTO;
import com.songhg.firefly.iot.system.dto.openapi.TenantOpenApiSubscriptionSaveDTO;
import com.songhg.firefly.iot.system.dto.openapi.TenantOpenApiSubscriptionVO;
import com.songhg.firefly.iot.system.entity.OpenApiCatalog;
import com.songhg.firefly.iot.system.entity.TenantOpenApiSubscription;
import com.songhg.firefly.iot.system.mapper.TenantOpenApiSubscriptionMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class TenantOpenApiSubscriptionService {

    private final TenantOpenApiSubscriptionMapper subscriptionMapper;
    private final OpenApiCatalogService openApiCatalogService;
    private final ObjectMapper objectMapper;

    public List<TenantOpenApiSubscriptionVO> listSubscriptions(Long tenantId) {
        Map<String, TenantOpenApiSubscription> subscriptionsByCode = new LinkedHashMap<>();
        subscriptionMapper.selectList(new LambdaQueryWrapper<TenantOpenApiSubscription>()
                        .eq(TenantOpenApiSubscription::getTenantId, tenantId))
                .forEach(item -> subscriptionsByCode.put(item.getOpenApiCode(), item));

        List<TenantOpenApiSubscriptionVO> result = new ArrayList<>();
        for (OpenApiOptionVO option : openApiCatalogService.listAllOptions()) {
            TenantOpenApiSubscriptionVO vo = new TenantOpenApiSubscriptionVO();
            vo.setOpenApiCode(option.getCode());
            vo.setName(option.getName());
            vo.setServiceCode(option.getServiceCode());
            vo.setHttpMethod(option.getHttpMethod());
            vo.setPathPattern(option.getPathPattern());
            vo.setGatewayPath(option.getGatewayPath());
            vo.setPermissionCode(option.getPermissionCode());
            OpenApiCatalog catalog = openApiCatalogService.requireOpenApi(option.getCode());
            vo.setEnabled(catalog.getEnabled());

            TenantOpenApiSubscription subscription = subscriptionsByCode.get(option.getCode());
            vo.setSubscribed(subscription != null);
            if (subscription != null) {
                vo.setIpWhitelist(fromJson(subscription.getIpWhitelist()));
                vo.setConcurrencyLimit(subscription.getConcurrencyLimit());
                vo.setDailyLimit(subscription.getDailyLimit());
            } else {
                vo.setIpWhitelist(List.of());
                vo.setConcurrencyLimit(-1);
                vo.setDailyLimit(-1L);
            }
            result.add(vo);
        }
        return result;
    }

    public List<OpenApiOptionVO> listSubscribedEnabledOptions(Long tenantId) {
        Set<String> subscribedCodes = listSubscribedCodes(tenantId);
        if (subscribedCodes.isEmpty()) {
            return List.of();
        }
        return openApiCatalogService.listEnabledOptions().stream()
                .filter(item -> subscribedCodes.contains(item.getCode()))
                .toList();
    }

    public Set<String> listSubscribedCodes(Long tenantId) {
        return subscriptionMapper.selectList(new LambdaQueryWrapper<TenantOpenApiSubscription>()
                        .select(TenantOpenApiSubscription::getOpenApiCode)
                        .eq(TenantOpenApiSubscription::getTenantId, tenantId))
                .stream()
                .map(TenantOpenApiSubscription::getOpenApiCode)
                .filter(StringUtils::hasText)
                .collect(LinkedHashSet::new, Set::add, Set::addAll);
    }

    public TenantOpenApiSubscription requireSubscription(Long tenantId, String openApiCode) {
        TenantOpenApiSubscription subscription = subscriptionMapper.selectOne(new LambdaQueryWrapper<TenantOpenApiSubscription>()
                .eq(TenantOpenApiSubscription::getTenantId, tenantId)
                .eq(TenantOpenApiSubscription::getOpenApiCode, openApiCode)
                .last("LIMIT 1"));
        if (subscription == null) {
            throw new BizException(ResultCode.PERMISSION_DENIED, "tenant has not subscribed the open api");
        }
        return subscription;
    }

    @Transactional
    public List<TenantOpenApiSubscriptionVO> replaceSubscriptions(Long tenantId, TenantOpenApiSubscriptionSaveDTO dto) {
        List<TenantOpenApiSubscriptionItemDTO> items = dto == null || dto.getItems() == null ? List.of() : dto.getItems();
        Set<String> enabledCodes = openApiCatalogService.listEnabledCodes();
        Set<String> requestedCodes = new LinkedHashSet<>();
        for (TenantOpenApiSubscriptionItemDTO item : items) {
            String openApiCode = normalizeCode(item.getOpenApiCode());
            if (!enabledCodes.contains(openApiCode)) {
                throw new BizException(ResultCode.PARAM_ERROR, "open api is not enabled: " + openApiCode);
            }
            if (!requestedCodes.add(openApiCode)) {
                throw new BizException(ResultCode.PARAM_ERROR, "duplicate open api subscription: " + openApiCode);
            }
        }

        subscriptionMapper.delete(new LambdaQueryWrapper<TenantOpenApiSubscription>()
                .eq(TenantOpenApiSubscription::getTenantId, tenantId));

        Long operatorId = AppContextHolder.getUserId();
        for (TenantOpenApiSubscriptionItemDTO item : items) {
            TenantOpenApiSubscription entity = new TenantOpenApiSubscription();
            entity.setTenantId(tenantId);
            entity.setOpenApiCode(normalizeCode(item.getOpenApiCode()));
            entity.setIpWhitelist(toJson(normalizeIpWhitelist(item.getIpWhitelist())));
            entity.setConcurrencyLimit(normalizeConcurrencyLimit(item.getConcurrencyLimit()));
            entity.setDailyLimit(normalizeDailyLimit(item.getDailyLimit()));
            entity.setCreatedBy(operatorId);
            entity.setCreatedAt(LocalDateTime.now());
            entity.setUpdatedAt(LocalDateTime.now());
            subscriptionMapper.insert(entity);
        }
        return listSubscriptions(tenantId);
    }

    public List<String> getIpWhitelist(TenantOpenApiSubscription subscription) {
        return fromJson(subscription.getIpWhitelist());
    }

    private Integer normalizeConcurrencyLimit(Integer concurrencyLimit) {
        if (concurrencyLimit == null) {
            return -1;
        }
        if (concurrencyLimit == 0 || concurrencyLimit < -1) {
            throw new BizException(ResultCode.PARAM_ERROR, "invalid concurrency limit");
        }
        return concurrencyLimit;
    }

    private Long normalizeDailyLimit(Long dailyLimit) {
        if (dailyLimit == null) {
            return -1L;
        }
        if (dailyLimit == 0 || dailyLimit < -1) {
            throw new BizException(ResultCode.PARAM_ERROR, "invalid daily limit");
        }
        return dailyLimit;
    }

    private String normalizeCode(String openApiCode) {
        if (!StringUtils.hasText(openApiCode)) {
            throw new BizException(ResultCode.PARAM_ERROR, "open api code is required");
        }
        return openApiCode.trim();
    }

    private List<String> normalizeIpWhitelist(Collection<String> ipWhitelist) {
        if (ipWhitelist == null) {
            return List.of();
        }
        Set<String> values = new LinkedHashSet<>();
        for (String item : ipWhitelist) {
            if (StringUtils.hasText(item)) {
                values.add(item.trim());
            }
        }
        return new ArrayList<>(values);
    }

    private String toJson(List<String> values) {
        try {
            return objectMapper.writeValueAsString(values == null ? List.of() : values);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    private List<String> fromJson(String value) {
        if (!StringUtils.hasText(value)) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(value, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            return Collections.emptyList();
        }
    }
}
