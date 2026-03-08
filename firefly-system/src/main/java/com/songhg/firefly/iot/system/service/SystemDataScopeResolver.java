package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.enums.DataScopeType;
import com.songhg.firefly.iot.common.mybatis.DataScopeConfig;
import com.songhg.firefly.iot.common.mybatis.DataScopeContext;
import com.songhg.firefly.iot.common.mybatis.DataScopeResolver;
import com.songhg.firefly.iot.system.entity.Role;
import com.songhg.firefly.iot.system.entity.UserRole;
import com.songhg.firefly.iot.system.mapper.RoleMapper;
import com.songhg.firefly.iot.system.mapper.UserRoleMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 系统模块数据范围解析器实现。
 * 根据用户角色的 dataScope 字段，计算当前用户的最宽数据范围。
 * 范围优先级: ALL > PROJECT > GROUP > SELF
 *
 * PROJECT 范围: 取用户通过 user_roles.project_id 绑定的所有项目 ID。
 * GROUP 范围: 合并所有角色 dataScopeConfig.groupIds。
 * CUSTOM 范围: 合并所有角色 dataScopeConfig.projectIds。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SystemDataScopeResolver implements DataScopeResolver {

    private final UserRoleMapper userRoleMapper;
    private final RoleMapper roleMapper;

    @Override
    public DataScopeContext resolve(Long userId, Long tenantId) {
        // 查询用户的所有角色绑定
        List<UserRole> userRoles = userRoleMapper.selectList(
                new LambdaQueryWrapper<UserRole>().eq(UserRole::getUserId, userId));
        if (userRoles.isEmpty()) {
            // 无角色默认 SELF
            return buildSelfContext(userId);
        }

        List<Long> roleIds = userRoles.stream()
                .map(UserRole::getRoleId)
                .collect(Collectors.toList());

        List<Role> roles = roleMapper.selectBatchIds(roleIds);

        // 取最宽范围
        DataScopeType widest = DataScopeType.SELF;
        for (Role role : roles) {
            DataScopeType scope = role.getDataScope() != null ? role.getDataScope() : DataScopeType.SELF;
            if (scope == DataScopeType.ALL) {
                widest = DataScopeType.ALL;
                break;
            }
            if (scope == DataScopeType.PROJECT && widest != DataScopeType.ALL) {
                widest = DataScopeType.PROJECT;
            }
            if (scope == DataScopeType.CUSTOM && widest.ordinal() < DataScopeType.CUSTOM.ordinal()) {
                widest = DataScopeType.CUSTOM;
            }
            if (scope == DataScopeType.GROUP && widest == DataScopeType.SELF) {
                widest = DataScopeType.GROUP;
            }
        }

        DataScopeContext ctx = new DataScopeContext();
        ctx.setScopeType(widest);
        ctx.setUserId(userId);

        switch (widest) {
            case ALL -> { /* 不需要额外数据 */ }
            case PROJECT -> ctx.setProjectIds(collectUserProjectIds(userRoles));
            case CUSTOM -> ctx.setProjectIds(collectConfigProjectIds(roles));
            case GROUP -> ctx.setGroupIds(collectConfigGroupIds(roles));
            case SELF -> { /* userId 已设置 */ }
        }

        log.debug("DataScope resolved: userId={}, scope={}, projectIds={}, groupIds={}",
                userId, widest, ctx.getProjectIds(), ctx.getGroupIds());
        return ctx;
    }

    private DataScopeContext buildSelfContext(Long userId) {
        DataScopeContext ctx = new DataScopeContext();
        ctx.setScopeType(DataScopeType.SELF);
        ctx.setUserId(userId);
        return ctx;
    }

    /**
     * PROJECT 范围: 从 user_roles 表中收集用户绑定的所有 project_id。
     */
    private List<Long> collectUserProjectIds(List<UserRole> userRoles) {
        Set<Long> projectIds = new LinkedHashSet<>();
        for (UserRole ur : userRoles) {
            if (ur.getProjectId() != null) {
                projectIds.add(ur.getProjectId());
            }
        }
        return new ArrayList<>(projectIds);
    }

    /**
     * CUSTOM 范围: 合并所有 CUSTOM 角色的 dataScopeConfig.projectIds。
     */
    private List<Long> collectConfigProjectIds(List<Role> roles) {
        Set<Long> projectIds = new LinkedHashSet<>();
        for (Role role : roles) {
            DataScopeConfig config = role.getDataScopeConfig();
            if (config != null && config.getProjectIds() != null) {
                projectIds.addAll(config.getProjectIds());
            }
        }
        return new ArrayList<>(projectIds);
    }

    /**
     * GROUP 范围: 合并所有 GROUP 角色的 dataScopeConfig.groupIds。
     */
    private List<String> collectConfigGroupIds(List<Role> roles) {
        Set<String> groupIds = new LinkedHashSet<>();
        for (Role role : roles) {
            DataScopeConfig config = role.getDataScopeConfig();
            if (config != null && config.getGroupIds() != null) {
                groupIds.addAll(config.getGroupIds());
            }
        }
        return new ArrayList<>(groupIds);
    }
}
