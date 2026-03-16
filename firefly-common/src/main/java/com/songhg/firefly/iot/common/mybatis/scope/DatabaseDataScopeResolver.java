package com.songhg.firefly.iot.common.mybatis.scope;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.enums.DataScopeType;
import com.songhg.firefly.iot.common.enums.RoleStatus;
import com.songhg.firefly.iot.common.mybatis.DataScopeConfig;
import com.songhg.firefly.iot.common.mybatis.DataScopeContext;
import com.songhg.firefly.iot.common.mybatis.DataScopeResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * Shared data-scope resolver used by all business services.
 * It derives project/product/device visibility directly from role data-scope config
 * so device/rule/media services enforce the same scope model as the system service.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnClass(name = "com.baomidou.mybatisplus.core.mapper.BaseMapper")
@ConditionalOnBean({
        DataScopeUserRoleMapper.class,
        DataScopeRoleMapper.class,
        DataScopeDeviceMapper.class,
        DataScopeProductMapper.class,
        DataScopeDeviceGroupMemberMapper.class
})
public class DatabaseDataScopeResolver implements DataScopeResolver {

    private final DataScopeUserRoleMapper userRoleMapper;
    private final DataScopeRoleMapper roleMapper;
    private final DataScopeDeviceMapper deviceMapper;
    private final DataScopeProductMapper productMapper;
    private final DataScopeDeviceGroupMemberMapper deviceGroupMemberMapper;

    @Override
    public DataScopeContext resolve(Long userId, Long tenantId) {
        List<DataScopeUserRoleEntity> userRoles = userRoleMapper.selectList(
                new LambdaQueryWrapper<DataScopeUserRoleEntity>().eq(DataScopeUserRoleEntity::getUserId, userId));
        if (userRoles.isEmpty()) {
            return buildSelfContext(userId);
        }

        List<Long> roleIds = userRoles.stream()
                .map(DataScopeUserRoleEntity::getRoleId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (roleIds.isEmpty()) {
            return buildSelfContext(userId);
        }

        List<DataScopeRoleEntity> roles = roleMapper.selectList(
                new LambdaQueryWrapper<DataScopeRoleEntity>()
                        .in(DataScopeRoleEntity::getId, roleIds)
                        .eq(tenantId != null, DataScopeRoleEntity::getTenantId, tenantId)
                        .eq(DataScopeRoleEntity::getStatus, RoleStatus.ACTIVE));
        if (roles.isEmpty()) {
            return buildSelfContext(userId);
        }

        if (roles.stream().anyMatch(role -> role.getDataScope() == DataScopeType.ALL)) {
            DataScopeContext ctx = new DataScopeContext();
            ctx.setScopeType(DataScopeType.ALL);
            ctx.setUserId(userId);
            return ctx;
        }

        Set<Long> configuredProjectIds = new LinkedHashSet<>();
        Set<Long> configuredGroupIds = new LinkedHashSet<>();
        boolean hasScopedRole = false;
        for (DataScopeRoleEntity role : roles) {
            DataScopeType scopeType = role.getDataScope();
            if (scopeType == null || scopeType == DataScopeType.SELF) {
                continue;
            }
            hasScopedRole = true;
            DataScopeConfig config = role.getDataScopeConfig();
            if (scopeType == DataScopeType.PROJECT || scopeType == DataScopeType.CUSTOM) {
                configuredProjectIds.addAll(normalizeLongIds(config == null ? null : config.getProjectIds()));
            }
            if (scopeType == DataScopeType.GROUP || scopeType == DataScopeType.CUSTOM) {
                configuredGroupIds.addAll(normalizeLongIds(config == null ? null : config.getGroupIds()));
            }
        }

        if (!hasScopedRole) {
            return buildSelfContext(userId);
        }

        Set<Long> projectIds = new LinkedHashSet<>(configuredProjectIds);
        Set<Long> productIds = new LinkedHashSet<>();
        Set<Long> deviceIds = new LinkedHashSet<>();

        if (!configuredProjectIds.isEmpty()) {
            List<DataScopeDeviceEntity> projectDevices = deviceMapper.selectList(
                    new LambdaQueryWrapper<DataScopeDeviceEntity>()
                            .eq(DataScopeDeviceEntity::getTenantId, tenantId)
                            .in(DataScopeDeviceEntity::getProjectId, configuredProjectIds)
                            .isNull(DataScopeDeviceEntity::getDeletedAt));
            projectDevices.forEach(device -> {
                if (device.getId() != null) {
                    deviceIds.add(device.getId());
                }
                if (device.getProductId() != null) {
                    productIds.add(device.getProductId());
                }
            });

            productMapper.selectList(new LambdaQueryWrapper<DataScopeProductEntity>()
                            .eq(DataScopeProductEntity::getTenantId, tenantId)
                            .in(DataScopeProductEntity::getProjectId, configuredProjectIds))
                    .forEach(product -> {
                        if (product.getId() != null) {
                            productIds.add(product.getId());
                        }
                    });
        }

        if (!configuredGroupIds.isEmpty()) {
            List<Long> groupedDeviceIds = deviceGroupMemberMapper.selectList(
                            new LambdaQueryWrapper<DataScopeDeviceGroupMemberEntity>()
                                    .in(DataScopeDeviceGroupMemberEntity::getGroupId, configuredGroupIds))
                    .stream()
                    .map(DataScopeDeviceGroupMemberEntity::getDeviceId)
                    .filter(Objects::nonNull)
                    .distinct()
                    .toList();
            if (!groupedDeviceIds.isEmpty()) {
                deviceMapper.selectList(new LambdaQueryWrapper<DataScopeDeviceEntity>()
                                .eq(DataScopeDeviceEntity::getTenantId, tenantId)
                                .in(DataScopeDeviceEntity::getId, groupedDeviceIds)
                                .isNull(DataScopeDeviceEntity::getDeletedAt))
                        .forEach(device -> {
                            if (device.getId() != null) {
                                deviceIds.add(device.getId());
                            }
                            if (device.getProjectId() != null) {
                                projectIds.add(device.getProjectId());
                            }
                            if (device.getProductId() != null) {
                                productIds.add(device.getProductId());
                            }
                        });
            }
        }

        DataScopeContext ctx = new DataScopeContext();
        ctx.setUserId(userId);
        ctx.setScopeType(DataScopeType.CUSTOM);
        ctx.setProjectIds(new ArrayList<>(projectIds));
        ctx.setProductIds(new ArrayList<>(productIds));
        ctx.setDeviceIds(new ArrayList<>(deviceIds));
        ctx.setGroupIds(configuredGroupIds.stream().map(String::valueOf).toList());
        log.debug("DataScope resolved: userId={}, projects={}, products={}, devices={}, groups={}",
                userId, ctx.getProjectIds(), ctx.getProductIds(), ctx.getDeviceIds(), ctx.getGroupIds());
        return ctx;
    }

    private DataScopeContext buildSelfContext(Long userId) {
        DataScopeContext ctx = new DataScopeContext();
        ctx.setScopeType(DataScopeType.SELF);
        ctx.setUserId(userId);
        return ctx;
    }

    private List<Long> normalizeLongIds(List<?> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        Set<Long> ids = new LinkedHashSet<>();
        for (Object value : values) {
            if (value instanceof Number number) {
                ids.add(number.longValue());
                continue;
            }
            if (value instanceof String text) {
                String trimmed = text.trim();
                if (trimmed.isEmpty()) {
                    continue;
                }
                try {
                    ids.add(Long.parseLong(trimmed));
                } catch (NumberFormatException ignore) {
                    log.warn("Skip non-numeric data-scope id: {}", trimmed);
                }
            }
        }
        return new ArrayList<>(ids);
    }
}
