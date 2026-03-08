package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.UserContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.config.properties.TenantAdminProperties;
import com.songhg.firefly.iot.system.convert.PermissionResourceConvert;
import com.songhg.firefly.iot.system.dto.permission.PermissionResourceVO;
import com.songhg.firefly.iot.system.dto.system.TenantAdminDefaultPermissionsVO;
import com.songhg.firefly.iot.system.entity.PermissionResource;
import com.songhg.firefly.iot.system.entity.SystemConfig;
import com.songhg.firefly.iot.system.mapper.SystemConfigMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class TenantAdminSettingsService {

    private record ResolvedDefaultPermissions(List<String> permissions, String source) {}

    private static final String CONFIG_GROUP = "platform";
    private static final String CONFIG_KEY = "tenant.admin.default-permissions";
    private static final String CONFIG_VALUE_TYPE = "JSON";
    private static final String SOURCE_SYSTEM_SETTINGS = "SYSTEM_SETTINGS";
    private static final String SOURCE_APPLICATION_DEFAULT = "APPLICATION_DEFAULT";
    private static final String CONFIG_DESCRIPTION = "新租户管理员默认权限(JSON数组)";
    private static final TypeReference<List<String>> STRING_LIST_TYPE = new TypeReference<>() {};

    private final TenantAdminProperties tenantAdminProperties;
    private final UserDomainService userDomainService;
    private final PermissionResourceService permissionResourceService;
    private final SystemConfigMapper systemConfigMapper;
    private final SystemConfigService systemConfigService;
    private final ObjectMapper objectMapper;

    public List<String> getEffectiveDefaultPermissions() {
        return resolveDefaultPermissions().permissions();
    }

    public TenantAdminDefaultPermissionsVO getDefaultPermissionsSettings() {
        userDomainService.assertCurrentUserIsSystemOps();

        ResolvedDefaultPermissions resolved = resolveDefaultPermissions();
        TenantAdminDefaultPermissionsVO result = new TenantAdminDefaultPermissionsVO();
        result.setPermissions(resolved.permissions());
        result.setSource(resolved.source());
        result.setAvailablePermissions(listAvailablePermissions());
        return result;
    }

    @Transactional
    @CacheEvict(value = "system_config", allEntries = true)
    public TenantAdminDefaultPermissionsVO updateDefaultPermissions(List<String> permissions) {
        userDomainService.assertCurrentUserIsSystemOps();

        List<PermissionResourceVO> availablePermissions = listAvailablePermissions();
        Set<String> availableCodes = new LinkedHashSet<>();
        for (PermissionResourceVO item : availablePermissions) {
            if (StringUtils.hasText(item.getCode())) {
                availableCodes.add(item.getCode().trim());
            }
        }

        List<String> normalizedPermissions = normalizePermissions(permissions);
        if (normalizedPermissions.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "默认权限不能为空");
        }
        for (String permission : normalizedPermissions) {
            if (!availableCodes.contains(permission)) {
                throw new BizException(ResultCode.PARAM_ERROR, "包含无效权限: " + permission);
            }
        }

        Long platformTenantId = userDomainService.getPlatformTenantId();
        Long operatorId = UserContextHolder.getUserId();
        SystemConfig existing = systemConfigMapper.selectOne(new LambdaQueryWrapper<SystemConfig>()
                .eq(SystemConfig::getTenantId, platformTenantId)
                .eq(SystemConfig::getConfigKey, CONFIG_KEY)
                .last("LIMIT 1"));

        if (existing == null) {
            SystemConfig created = new SystemConfig();
            created.setTenantId(platformTenantId);
            created.setConfigGroup(CONFIG_GROUP);
            created.setConfigKey(CONFIG_KEY);
            created.setConfigValue(serializePermissions(normalizedPermissions));
            created.setValueType(CONFIG_VALUE_TYPE);
            created.setDescription(CONFIG_DESCRIPTION);
            created.setUpdatedBy(operatorId);
            created.setCreatedAt(LocalDateTime.now());
            created.setUpdatedAt(LocalDateTime.now());
            systemConfigMapper.insert(created);
        } else {
            existing.setConfigGroup(CONFIG_GROUP);
            existing.setConfigValue(serializePermissions(normalizedPermissions));
            existing.setValueType(CONFIG_VALUE_TYPE);
            existing.setDescription(CONFIG_DESCRIPTION);
            existing.setUpdatedBy(operatorId);
            existing.setUpdatedAt(LocalDateTime.now());
            systemConfigMapper.updateById(existing);
        }

        TenantAdminDefaultPermissionsVO result = new TenantAdminDefaultPermissionsVO();
        result.setPermissions(normalizedPermissions);
        result.setSource(SOURCE_SYSTEM_SETTINGS);
        result.setAvailablePermissions(availablePermissions);
        return result;
    }

    private ResolvedDefaultPermissions resolveDefaultPermissions() {
        Long platformTenantId = userDomainService.getPlatformTenantId();
        String configuredValue = systemConfigService.getValue(platformTenantId, CONFIG_KEY);
        List<String> configuredPermissions = parsePermissions(configuredValue);
        if (!configuredPermissions.isEmpty()) {
            return new ResolvedDefaultPermissions(configuredPermissions, SOURCE_SYSTEM_SETTINGS);
        }
        return new ResolvedDefaultPermissions(
                normalizePermissions(tenantAdminProperties.getDefaultPermissions()),
                SOURCE_APPLICATION_DEFAULT);
    }

    private List<PermissionResourceVO> listAvailablePermissions() {
        return permissionResourceService.listAll().stream()
                .filter(item -> Boolean.TRUE.equals(item.getEnabled()) && StringUtils.hasText(item.getCode()))
                .sorted((left, right) -> {
                    int typeCompare = compareNullable(left.getType(), right.getType());
                    if (typeCompare != 0) {
                        return typeCompare;
                    }
                    int sortCompare = compareNullable(left.getSortOrder(), right.getSortOrder());
                    if (sortCompare != 0) {
                        return sortCompare;
                    }
                    return compareNullable(left.getId(), right.getId());
                })
                .map(PermissionResourceConvert.INSTANCE::toVO)
                .toList();
    }

    private List<String> parsePermissions(String rawValue) {
        if (!StringUtils.hasText(rawValue)) {
            return List.of();
        }
        try {
            return normalizePermissions(objectMapper.readValue(rawValue, STRING_LIST_TYPE));
        } catch (Exception ex) {
            log.warn("Failed to parse tenant admin default permissions config, fallback to application defaults", ex);
            return List.of();
        }
    }

    private List<String> normalizePermissions(List<String> source) {
        Set<String> normalized = new LinkedHashSet<>();
        if (source != null) {
            for (String permission : source) {
                if (StringUtils.hasText(permission)) {
                    normalized.add(permission.trim());
                }
            }
        }
        return new ArrayList<>(normalized);
    }

    private String serializePermissions(List<String> permissions) {
        try {
            return objectMapper.writeValueAsString(normalizePermissions(permissions));
        } catch (Exception ex) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "默认权限序列化失败");
        }
    }

    private static <T extends Comparable<T>> int compareNullable(T left, T right) {
        if (left == null && right == null) {
            return 0;
        }
        if (left == null) {
            return 1;
        }
        if (right == null) {
            return -1;
        }
        return left.compareTo(right);
    }
}
