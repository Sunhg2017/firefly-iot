package com.songhg.firefly.iot.rule.dataforward.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.ForwardStatus;
import com.songhg.firefly.iot.common.enums.PlatformEventType;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.rule.dataforward.dto.EventSubscriptionCreateDTO;
import com.songhg.firefly.iot.rule.dataforward.dto.EventSubscriptionQueryDTO;
import com.songhg.firefly.iot.rule.dataforward.dto.EventSubscriptionUpdateDTO;
import com.songhg.firefly.iot.rule.dataforward.dto.EventSubscriptionVO;
import com.songhg.firefly.iot.rule.dataforward.entity.EventSubscription;
import com.songhg.firefly.iot.rule.dataforward.mapper.EventSubscriptionMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class EventSubscriptionService {

    private final EventSubscriptionMapper subscriptionMapper;
    private final ObjectMapper objectMapper;

    @Transactional
    public EventSubscriptionVO create(EventSubscriptionCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();

        EventSubscription subscription = new EventSubscription();
        subscription.setTenantId(tenantId);
        subscription.setCreatedBy(userId);
        subscription.setStatus(ForwardStatus.DISABLED);
        subscription.setDeliveryCount(0L);
        subscription.setSuccessCount(0L);
        subscription.setErrorCount(0L);
        subscription.setName(requireText(dto.getName(), "订阅名称"));
        subscription.setWebhookUrl(requireText(dto.getWebhookUrl(), "回调地址"));
        subscription.setSecret(normalizeOptional(dto.getSecret()));
        subscription.setEventTypes(serializeEventTypes(dto.getEventTypes()));
        subscription.setHeaders(serializeHeaders(dto.getHeaders()));

        subscriptionMapper.insert(subscription);
        log.info("Event subscription created: id={}, name={}, tenantId={}", subscription.getId(), subscription.getName(), tenantId);
        return buildVO(subscription);
    }

    public EventSubscriptionVO getById(Long id) {
        return buildVO(requireOwnedSubscription(id));
    }

    public IPage<EventSubscriptionVO> list(EventSubscriptionQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<EventSubscription> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<EventSubscription> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(EventSubscription::getTenantId, tenantId);
        if (StringUtils.hasText(query.getKeyword())) {
            wrapper.like(EventSubscription::getName, query.getKeyword().trim());
        }
        if (query.getStatus() != null) {
            wrapper.eq(EventSubscription::getStatus, query.getStatus());
        }
        wrapper.orderByDesc(EventSubscription::getCreatedAt);

        IPage<EventSubscription> result = subscriptionMapper.selectPage(page, wrapper);
        Page<EventSubscriptionVO> voPage = new Page<>(result.getCurrent(), result.getSize(), result.getTotal());
        voPage.setRecords(result.getRecords().stream().map(this::buildVO).toList());
        return voPage;
    }

    @Transactional
    public EventSubscriptionVO update(Long id, EventSubscriptionUpdateDTO dto) {
        EventSubscription subscription = requireOwnedSubscription(id);
        if (dto.getName() != null) {
            subscription.setName(requireText(dto.getName(), "订阅名称"));
        }
        if (dto.getWebhookUrl() != null) {
            subscription.setWebhookUrl(requireText(dto.getWebhookUrl(), "回调地址"));
        }
        if (dto.getSecret() != null) {
            subscription.setSecret(normalizeOptional(dto.getSecret()));
        }
        if (dto.getEventTypes() != null) {
            subscription.setEventTypes(serializeEventTypes(dto.getEventTypes()));
        }
        if (dto.getHeaders() != null) {
            subscription.setHeaders(serializeHeaders(dto.getHeaders()));
        }
        subscriptionMapper.updateById(subscription);
        return buildVO(subscription);
    }

    @Transactional
    public void enable(Long id) {
        EventSubscription subscription = requireOwnedSubscription(id);
        if (!StringUtils.hasText(subscription.getWebhookUrl())) {
            throw new BizException(ResultCode.PARAM_ERROR, "回调地址不能为空");
        }
        if (deserializeEventTypes(subscription.getEventTypes()).isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "至少选择一个事件类型");
        }
        subscription.setStatus(ForwardStatus.ENABLED);
        subscriptionMapper.updateById(subscription);
        log.info("Event subscription enabled: id={}, name={}", id, subscription.getName());
    }

    @Transactional
    public void disable(Long id) {
        EventSubscription subscription = requireOwnedSubscription(id);
        subscription.setStatus(ForwardStatus.DISABLED);
        subscriptionMapper.updateById(subscription);
        log.info("Event subscription disabled: id={}, name={}", id, subscription.getName());
    }

    @Transactional
    public void delete(Long id) {
        EventSubscription subscription = requireOwnedSubscription(id);
        subscriptionMapper.deleteById(id);
        log.info("Event subscription deleted: id={}, name={}", id, subscription.getName());
    }

    private EventSubscription requireOwnedSubscription(Long id) {
        Long tenantId = AppContextHolder.getTenantId();
        EventSubscription subscription = subscriptionMapper.selectOne(new LambdaQueryWrapper<EventSubscription>()
                .eq(EventSubscription::getId, id)
                .eq(EventSubscription::getTenantId, tenantId));
        if (subscription == null) {
            throw new BizException(ResultCode.EVENT_SUBSCRIPTION_NOT_FOUND);
        }
        return subscription;
    }

    private String serializeEventTypes(List<PlatformEventType> eventTypes) {
        if (eventTypes == null || eventTypes.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "至少选择一个事件类型");
        }
        Set<String> values = new LinkedHashSet<>();
        for (PlatformEventType type : eventTypes) {
            if (type != null) {
                values.add(type.getValue());
            }
        }
        if (values.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "至少选择一个事件类型");
        }
        try {
            return objectMapper.writeValueAsString(values);
        } catch (JsonProcessingException ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "事件类型序列化失败");
        }
    }

    private List<PlatformEventType> deserializeEventTypes(String raw) {
        if (!StringUtils.hasText(raw)) {
            return List.of();
        }
        try {
            List<String> values = objectMapper.readValue(raw, new TypeReference<>() {
            });
            return values.stream()
                    .map(PlatformEventType::valueOf)
                    .toList();
        } catch (Exception ex) {
            return List.of();
        }
    }

    private String serializeHeaders(Map<String, String> headers) {
        if (headers == null || headers.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(headers);
        } catch (JsonProcessingException ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "自定义请求头序列化失败");
        }
    }

    private Map<String, String> deserializeHeaders(String raw) {
        if (!StringUtils.hasText(raw)) {
            return Collections.emptyMap();
        }
        try {
            return objectMapper.readValue(raw, new TypeReference<>() {
            });
        } catch (Exception ex) {
            return Collections.emptyMap();
        }
    }

    private EventSubscriptionVO buildVO(EventSubscription subscription) {
        EventSubscriptionVO vo = new EventSubscriptionVO();
        vo.setId(subscription.getId());
        vo.setName(subscription.getName());
        vo.setEventTypes(deserializeEventTypes(subscription.getEventTypes()));
        vo.setWebhookUrl(subscription.getWebhookUrl());
        vo.setSecret(subscription.getSecret());
        vo.setHeaders(deserializeHeaders(subscription.getHeaders()));
        vo.setStatus(subscription.getStatus());
        vo.setDeliveryCount(subscription.getDeliveryCount());
        vo.setSuccessCount(subscription.getSuccessCount());
        vo.setErrorCount(subscription.getErrorCount());
        vo.setLastDeliveredAt(subscription.getLastDeliveredAt());
        vo.setCreatedAt(subscription.getCreatedAt());
        vo.setUpdatedAt(subscription.getUpdatedAt());
        return vo;
    }

    private String requireText(String value, String fieldName) {
        String normalized = normalizeOptional(value);
        if (normalized == null) {
            throw new BizException(ResultCode.PARAM_ERROR, fieldName + "不能为空");
        }
        return normalized;
    }

    private String normalizeOptional(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
