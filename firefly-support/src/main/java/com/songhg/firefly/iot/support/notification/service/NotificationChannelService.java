package com.songhg.firefly.iot.support.notification.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.support.notification.convert.NotificationConvert;
import com.songhg.firefly.iot.support.notification.dto.notification.NotificationChannelCreateDTO;
import com.songhg.firefly.iot.support.notification.dto.notification.NotificationChannelVO;
import com.songhg.firefly.iot.support.notification.entity.NotificationChannel;
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

    private final NotificationChannelMapper channelMapper;

    public List<NotificationChannelVO> listAll() {
        Long tenantId = AppContextHolder.getTenantId();
        LambdaQueryWrapper<NotificationChannel> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(NotificationChannel::getTenantId, tenantId)
                .orderByAsc(NotificationChannel::getType)
                .orderByAsc(NotificationChannel::getName);
        return channelMapper.selectList(wrapper)
                .stream().map(NotificationConvert.INSTANCE::toChannelVO).collect(Collectors.toList());
    }

    public List<NotificationChannelVO> listByType(String type) {
        Long tenantId = AppContextHolder.getTenantId();
        LambdaQueryWrapper<NotificationChannel> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(NotificationChannel::getTenantId, tenantId)
                .eq(NotificationChannel::getType, type)
                .eq(NotificationChannel::getEnabled, true);
        return channelMapper.selectList(wrapper)
                .stream().map(NotificationConvert.INSTANCE::toChannelVO).collect(Collectors.toList());
    }

    public NotificationChannelVO getById(Long id) {
        NotificationChannel channel = channelMapper.selectById(id);
        return channel != null ? NotificationConvert.INSTANCE.toChannelVO(channel) : null;
    }

    @Transactional
    public NotificationChannelVO create(NotificationChannelCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        NotificationChannel channel = new NotificationChannel();
        channel.setTenantId(tenantId);
        channel.setName(dto.getName());
        channel.setType(dto.getType());
        channel.setConfig(dto.getConfig());
        channel.setEnabled(dto.getEnabled() != null ? dto.getEnabled() : true);
        channel.setCreatedBy(AppContextHolder.getUserId());
        channel.setCreatedAt(LocalDateTime.now());
        channel.setUpdatedAt(LocalDateTime.now());
        channelMapper.insert(channel);
        return NotificationConvert.INSTANCE.toChannelVO(channel);
    }

    @Transactional
    public NotificationChannelVO update(Long id, NotificationChannelCreateDTO dto) {
        NotificationChannel channel = channelMapper.selectById(id);
        if (channel == null) return null;

        if (dto.getName() != null) channel.setName(dto.getName());
        if (dto.getType() != null) channel.setType(dto.getType());
        if (dto.getConfig() != null) channel.setConfig(dto.getConfig());
        if (dto.getEnabled() != null) channel.setEnabled(dto.getEnabled());
        channel.setUpdatedAt(LocalDateTime.now());
        channelMapper.updateById(channel);
        return NotificationConvert.INSTANCE.toChannelVO(channel);
    }

    public void delete(Long id) {
        channelMapper.deleteById(id);
    }

    public void toggleEnabled(Long id, boolean enabled) {
        NotificationChannel channel = channelMapper.selectById(id);
        if (channel != null) {
            channel.setEnabled(enabled);
            channel.setUpdatedAt(LocalDateTime.now());
            channelMapper.updateById(channel);
        }
    }
}
