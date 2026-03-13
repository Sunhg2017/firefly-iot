package com.songhg.firefly.iot.support.notification.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.support.notification.convert.NotificationConvert;
import com.songhg.firefly.iot.support.notification.dto.notification.NotificationChannelCreateDTO;
import com.songhg.firefly.iot.support.notification.dto.notification.NotificationChannelVO;
import com.songhg.firefly.iot.support.notification.entity.NotificationChannel;
import com.songhg.firefly.iot.support.notification.enums.NotificationChannelType;
import com.songhg.firefly.iot.support.notification.mapper.NotificationChannelMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationChannelService {

    private static final Long PLATFORM_CHANNEL_TENANT_ID = 0L;
    private static final String PLATFORM_TENANT_CODE = "system-ops";

    private final NotificationChannelMapper channelMapper;
    private final ObjectMapper objectMapper;

    public List<NotificationChannelVO> listAll() {
        Long tenantId = resolveManagedTenantId();
        LambdaQueryWrapper<NotificationChannel> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(NotificationChannel::getTenantId, tenantId)
                .orderByAsc(NotificationChannel::getType)
                .orderByAsc(NotificationChannel::getName);
        return channelMapper.selectList(wrapper)
                .stream()
                .map(NotificationConvert.INSTANCE::toChannelVO)
                .collect(Collectors.toList());
    }

    public List<NotificationChannelVO> listByType(String type) {
        Long tenantId = resolveManagedTenantId();
        String normalizedType = NotificationChannelType.of(type).code();
        LambdaQueryWrapper<NotificationChannel> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(NotificationChannel::getTenantId, tenantId)
                .eq(NotificationChannel::getType, normalizedType)
                .eq(NotificationChannel::getEnabled, true)
                .orderByAsc(NotificationChannel::getName);
        return channelMapper.selectList(wrapper)
                .stream()
                .map(NotificationConvert.INSTANCE::toChannelVO)
                .collect(Collectors.toList());
    }

    public NotificationChannelVO getById(Long id) {
        return NotificationConvert.INSTANCE.toChannelVO(getEntityById(id));
    }

    public NotificationChannel getEntityById(Long id) {
        Long tenantId = resolveManagedTenantId();
        NotificationChannel channel = channelMapper.selectById(id);
        if (channel == null || !tenantId.equals(channel.getTenantId())) {
            throw new BizException(ResultCode.NOT_FOUND, "notification channel not found");
        }
        return channel;
    }

    @Transactional
    public NotificationChannelVO create(NotificationChannelCreateDTO dto) {
        Long tenantId = resolveManagedTenantId();
        NotificationChannelType channelType = NotificationChannelType.of(dto.getType());

        NotificationChannel channel = new NotificationChannel();
        channel.setTenantId(tenantId);
        channel.setName(dto.getName().trim());
        channel.setType(channelType.code());
        channel.setConfig(normalizeConfig(channelType, dto.getConfig()));
        channel.setEnabled(dto.getEnabled() != null ? dto.getEnabled() : true);
        channel.setCreatedBy(AppContextHolder.getUserId());
        channel.setCreatedAt(LocalDateTime.now());
        channel.setUpdatedAt(LocalDateTime.now());
        channelMapper.insert(channel);
        return NotificationConvert.INSTANCE.toChannelVO(channel);
    }

    @Transactional
    public NotificationChannelVO update(Long id, NotificationChannelCreateDTO dto) {
        NotificationChannel channel = getEntityById(id);
        NotificationChannelType channelType = NotificationChannelType.of(channel.getType());

        if (dto.getName() != null && !dto.getName().isBlank()) {
            channel.setName(dto.getName().trim());
        }
        if (dto.getType() != null) {
            channelType = NotificationChannelType.of(dto.getType());
            channel.setType(channelType.code());
        }
        if (dto.getConfig() != null) {
            channel.setConfig(normalizeConfig(channelType, dto.getConfig()));
        }
        if (dto.getEnabled() != null) {
            channel.setEnabled(dto.getEnabled());
        }
        channel.setUpdatedAt(LocalDateTime.now());
        channelMapper.updateById(channel);
        return NotificationConvert.INSTANCE.toChannelVO(channel);
    }

    @Transactional
    public void delete(Long id) {
        channelMapper.deleteById(getEntityById(id).getId());
    }

    @Transactional
    public void toggleEnabled(Long id, boolean enabled) {
        NotificationChannel channel = getEntityById(id);
        channel.setEnabled(enabled);
        channel.setUpdatedAt(LocalDateTime.now());
        channelMapper.updateById(channel);
    }

    private String normalizeConfig(NotificationChannelType channelType, String rawConfig) {
        JsonNode configNode;
        try {
            String source = rawConfig == null || rawConfig.isBlank() ? "{}" : rawConfig;
            configNode = objectMapper.readTree(source);
        } catch (Exception ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "channel config must be valid JSON");
        }
        if (!configNode.isObject()) {
            throw new BizException(ResultCode.PARAM_ERROR, "channel config must be a JSON object");
        }

        switch (channelType) {
            case EMAIL -> {
                requireText(configNode, "smtpHost");
                requireText(configNode, "username");
                requireText(configNode, "password");
            }
            case WEBHOOK -> requireText(configNode, "url");
            case SMS, PHONE -> requireText(configNode, "apiUrl");
            case WECHAT, DINGTALK -> requireText(configNode, "webhookUrl");
            case IN_APP -> {
                // In-app delivery happens inside the platform, so external config is optional.
            }
        }

        try {
            return objectMapper.writeValueAsString(configNode);
        } catch (Exception ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "channel config serialization failed");
        }
    }

    private void requireText(JsonNode configNode, String fieldName) {
        if (!configNode.has(fieldName) || configNode.path(fieldName).asText().isBlank()) {
            throw new BizException(ResultCode.PARAM_ERROR, "channel config field is required: " + fieldName);
        }
    }

    /**
     * 平台运维空间统一维护平台默认渠道，租户空间仍维护本租户自有渠道。
     */
    private Long resolveManagedTenantId() {
        if (PLATFORM_TENANT_CODE.equalsIgnoreCase(AppContextHolder.getTenantCode())) {
            return PLATFORM_CHANNEL_TENANT_ID;
        }
        return AppContextHolder.getTenantId();
    }
}
