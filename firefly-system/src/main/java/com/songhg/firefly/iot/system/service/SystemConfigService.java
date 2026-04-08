package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.system.convert.SystemSettingsConvert;
import com.songhg.firefly.iot.system.dto.system.SystemConfigUpdateDTO;
import com.songhg.firefly.iot.system.dto.system.SystemConfigVO;
import com.songhg.firefly.iot.system.entity.SystemConfig;
import com.songhg.firefly.iot.system.mapper.SystemConfigMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SystemConfigService {

    private final SystemConfigMapper systemConfigMapper;

    /**
     * 获取指定分组的所有配置
     */
    public List<SystemConfigVO> listByGroup(String group) {
        Long tenantId = AppContextHolder.getTenantId();
        LambdaQueryWrapper<SystemConfig> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SystemConfig::getTenantId, tenantId);
        if (group != null && !group.isBlank()) {
            wrapper.eq(SystemConfig::getConfigGroup, group);
        }
        wrapper.orderByAsc(SystemConfig::getConfigGroup).orderByAsc(SystemConfig::getConfigKey);
        return systemConfigMapper.selectList(wrapper)
                .stream().map(SystemSettingsConvert.INSTANCE::toConfigVO).collect(Collectors.toList());
    }

    /**
     * 获取所有配置（按分组）
     */
    public Map<String, List<SystemConfigVO>> listGrouped() {
        List<SystemConfigVO> all = listByGroup(null);
        return all.stream().collect(Collectors.groupingBy(c -> c.getConfigGroup() != null ? c.getConfigGroup() : "default"));
    }

    /**
     * 获取单个配置值
     */
    @Cacheable(value = "system_config", key = "#tenantId + ':' + #key")
    public String getValue(Long tenantId, String key) {
        // 登录页会在匿名状态下读取 tenant_id=0 的全局 OAuth 配置，
        // 这里必须按显式 tenantId 查询，不能再依赖当前线程里的租户上下文。
        SystemConfig config = systemConfigMapper.selectByTenantIdAndConfigKey(tenantId, key);
        return config != null ? config.getConfigValue() : null;
    }

    /**
     * 获取配置值（带默认值）
     */
    public String getValue(Long tenantId, String key, String defaultValue) {
        String value = getValue(tenantId, key);
        return value != null ? value : defaultValue;
    }

    /**
     * 批量更新配置
     */
    @Transactional
    @CacheEvict(value = "system_config", allEntries = true)
    public void batchUpdate(List<SystemConfigUpdateDTO> configs) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();

        for (SystemConfigUpdateDTO dto : configs) {
            LambdaQueryWrapper<SystemConfig> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(SystemConfig::getTenantId, tenantId)
                    .eq(SystemConfig::getConfigKey, dto.getConfigKey());
            SystemConfig existing = systemConfigMapper.selectOne(wrapper);

            if (existing != null) {
                existing.setConfigValue(dto.getConfigValue());
                if (dto.getDescription() != null) {
                    existing.setDescription(dto.getDescription());
                }
                existing.setUpdatedBy(userId);
                existing.setUpdatedAt(LocalDateTime.now());
                systemConfigMapper.updateById(existing);
            } else {
                SystemConfig config = new SystemConfig();
                config.setTenantId(tenantId);
                config.setConfigGroup("custom");
                config.setConfigKey(dto.getConfigKey());
                config.setConfigValue(dto.getConfigValue());
                config.setValueType("STRING");
                config.setDescription(dto.getDescription());
                config.setUpdatedBy(userId);
                config.setCreatedAt(LocalDateTime.now());
                config.setUpdatedAt(LocalDateTime.now());
                systemConfigMapper.insert(config);
            }
        }
    }

    /**
     * 更新单个配置
     */
    @CacheEvict(value = "system_config", allEntries = true)
    public void updateConfig(SystemConfigUpdateDTO dto) {
        batchUpdate(List.of(dto));
    }
}
