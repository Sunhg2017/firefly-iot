package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.event.EventPublisher;
import com.songhg.firefly.iot.common.event.EventTopics;
import com.songhg.firefly.iot.common.event.RolePermissionEvent;
import com.songhg.firefly.iot.common.enums.DataScopeType;
import com.songhg.firefly.iot.common.enums.RoleStatus;
import com.songhg.firefly.iot.common.enums.RoleType;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.mybatis.DataScopeConfig;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.convert.UserConvert;
import com.songhg.firefly.iot.system.dto.role.RoleCreateDTO;
import com.songhg.firefly.iot.system.dto.role.RoleOptionVO;
import com.songhg.firefly.iot.system.dto.role.RolePermissionGroupVO;
import com.songhg.firefly.iot.system.dto.role.RoleQueryDTO;
import com.songhg.firefly.iot.system.dto.role.RoleUpdateDTO;
import com.songhg.firefly.iot.system.dto.role.RoleVO;
import com.songhg.firefly.iot.system.dto.user.UserVO;
import com.songhg.firefly.iot.system.entity.RolePermission;
import com.songhg.firefly.iot.system.entity.Role;
import com.songhg.firefly.iot.system.entity.User;
import com.songhg.firefly.iot.system.entity.UserRole;
import com.songhg.firefly.iot.system.convert.RoleConvert;
import com.songhg.firefly.iot.system.mapper.RoleMapper;
import com.songhg.firefly.iot.system.mapper.RolePermissionMapper;
import com.songhg.firefly.iot.system.mapper.UserMapper;
import com.songhg.firefly.iot.system.mapper.UserRoleMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import static com.songhg.firefly.iot.common.constant.AuthConstants.REDIS_PERM_ROLE;

@Slf4j
@Service
@RequiredArgsConstructor
public class RoleService {

    private final RoleMapper roleMapper;
    private final RolePermissionMapper rolePermissionMapper;
    private final UserRoleMapper userRoleMapper;
    private final UserMapper userMapper;
    private final StringRedisTemplate redisTemplate;
    private final EventPublisher eventPublisher;
    private final PermissionService permissionService;
    private final WorkspacePermissionCatalogService workspacePermissionCatalogService;

    @Transactional
    public RoleVO createRole(RoleCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "tenant context required");
        }

        // Check code uniqueness
        Long count = roleMapper.selectCount(
                new LambdaQueryWrapper<Role>()
                        .eq(Role::getTenantId, tenantId)
                        .eq(Role::getCode, dto.getCode()));
        if (count > 0) {
            throw new BizException(ResultCode.ROLE_CODE_EXISTS);
        }

        Role role = RoleConvert.INSTANCE.toEntity(dto);
        role.setTenantId(tenantId);
        role.setType(RoleType.CUSTOM);
        role.setSystemFlag(false);
        role.setStatus(RoleStatus.ACTIVE);
        role.setCreatedBy(AppContextHolder.getUserId());
        if (role.getDataScope() == null) {
            role.setDataScope(DataScopeType.PROJECT);
        }
        role.setDataScopeConfig(normalizeDataScopeConfig(role.getDataScope(), role.getDataScopeConfig()));
        roleMapper.insert(role);

        Set<String> normalizedPermissions = normalizeAndValidatePermissions(dto.getPermissions());
        replacePermissions(role.getId(), normalizedPermissions);
        return toRoleVO(role, normalizedPermissions, 0);
    }

    public RoleVO getRoleById(Long id) {
        Role role = requireRoleInCurrentTenant(id);
        Set<String> permissions = getRolePermissionSet(role.getId());
        int userCount = countUsersByRoleIds(List.of(role.getId())).getOrDefault(role.getId(), 0);
        return toRoleVO(role, permissions, userCount);
    }

    public IPage<RoleVO> listRoles(RoleQueryDTO query) {
        Long tenantId = requireTenantId();
        Page<Role> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<Role> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Role::getTenantId, tenantId);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.and(w -> w.like(Role::getName, query.getKeyword())
                    .or().like(Role::getCode, query.getKeyword()));
        }
        if (query.getType() != null) {
            wrapper.eq(Role::getType, query.getType());
        }
        if (query.getStatus() != null) {
            wrapper.eq(Role::getStatus, query.getStatus());
        }
        wrapper.orderByAsc(Role::getType).orderByAsc(Role::getCreatedAt);
        IPage<Role> result = roleMapper.selectPage(page, wrapper);
        List<Role> roles = result.getRecords();
        Map<Long, Set<String>> permissionMap = loadRolePermissionMap(roles.stream().map(Role::getId).toList());
        Map<Long, Integer> userCountMap = countUsersByRoleIds(roles.stream().map(Role::getId).toList());
        return result.convert(role -> toRoleVO(
                role,
                permissionMap.getOrDefault(role.getId(), Set.of()),
                userCountMap.getOrDefault(role.getId(), 0)));
    }

    @Transactional
    public RoleVO updateRole(Long id, RoleUpdateDTO dto) {
        Role role = requireRoleInCurrentTenant(id);
        if (Boolean.TRUE.equals(role.getSystemFlag())) {
            throw new BizException(ResultCode.ROLE_IS_SYSTEM);
        }
        RoleConvert.INSTANCE.updateEntity(dto, role);
        role.setDataScopeConfig(normalizeDataScopeConfig(role.getDataScope(), role.getDataScopeConfig()));
        roleMapper.updateById(role);

        Set<String> permissions = getRolePermissionSet(role.getId());
        if (dto.getPermissions() != null) {
            permissions = normalizeAndValidatePermissions(dto.getPermissions());
            replacePermissions(id, permissions);

            redisTemplate.delete(REDIS_PERM_ROLE + id);
            evictAffectedUserCaches(id);

            eventPublisher.publish(EventTopics.PERMISSION_EVENTS,
                    RolePermissionEvent.permissionsChanged(
                            role.getTenantId(), id, role.getCode(),
                            new ArrayList<>(permissions), AppContextHolder.getUserId()));
        }

        int userCount = countUsersByRoleIds(List.of(role.getId())).getOrDefault(role.getId(), 0);
        return toRoleVO(role, permissions, userCount);
    }

    private void evictAffectedUserCaches(Long roleId) {
        userRoleMapper.selectList(
                new LambdaQueryWrapper<UserRole>().eq(UserRole::getRoleId, roleId))
                .stream().map(UserRole::getUserId)
                .forEach(permissionService::evictUserCache);
    }

    public List<RoleOptionVO> listAssignableRoles() {
        Long tenantId = requireTenantId();
        return roleMapper.selectList(new LambdaQueryWrapper<Role>()
                        .eq(Role::getTenantId, tenantId)
                        .eq(Role::getStatus, RoleStatus.ACTIVE)
                        .orderByAsc(Role::getType)
                        .orderByAsc(Role::getCreatedAt))
                .stream()
                .map(role -> {
                    RoleOptionVO option = new RoleOptionVO();
                    option.setId(role.getId());
                    option.setCode(role.getCode());
                    option.setName(role.getName());
                    option.setType(role.getType());
                    option.setSystemFlag(role.getSystemFlag());
                    option.setStatus(role.getStatus());
                    return option;
                })
                .toList();
    }

    public List<RolePermissionGroupVO> listAssignablePermissionGroups() {
        return workspacePermissionCatalogService.listAssignablePermissionGroupsForCurrentWorkspace();
    }

    private void replacePermissions(Long roleId, Collection<String> permissions) {
        rolePermissionMapper.delete(
                new LambdaQueryWrapper<RolePermission>().eq(RolePermission::getRoleId, roleId));
        if (permissions == null || permissions.isEmpty()) {
            return;
        }
        for (String perm : permissions) {
            RolePermission rp = new RolePermission();
            rp.setRoleId(roleId);
            rp.setPermission(perm);
            rp.setCreatedAt(LocalDateTime.now());
            rolePermissionMapper.insert(rp);
        }
    }

    public List<UserVO> listUsersByRoleId(Long roleId) {
        Role role = requireRoleInCurrentTenant(roleId);
        List<UserRole> userRoles = userRoleMapper.selectList(
                new LambdaQueryWrapper<UserRole>().eq(UserRole::getRoleId, roleId));
        if (userRoles.isEmpty()) {
            return Collections.emptyList();
        }
        List<Long> userIds = userRoles.stream().map(UserRole::getUserId).collect(Collectors.toList());
        List<User> users = userMapper.selectBatchIds(userIds);
        return users.stream()
                .filter(u -> u.getDeletedAt() == null && role.getTenantId().equals(u.getTenantId()))
                .map(UserConvert.INSTANCE::toVO)
                .collect(Collectors.toList());
    }

    @Transactional
    public void deleteRole(Long id) {
        Role role = requireRoleInCurrentTenant(id);
        if (Boolean.TRUE.equals(role.getSystemFlag())) {
            throw new BizException(ResultCode.ROLE_IS_SYSTEM);
        }

        // Collect affected user IDs before deleting
        List<Long> affectedUserIds = userRoleMapper.selectList(
                new LambdaQueryWrapper<UserRole>().eq(UserRole::getRoleId, id))
                .stream().map(UserRole::getUserId).collect(Collectors.toList());

        rolePermissionMapper.delete(
                new LambdaQueryWrapper<RolePermission>().eq(RolePermission::getRoleId, id));
        userRoleMapper.delete(
                new LambdaQueryWrapper<UserRole>().eq(UserRole::getRoleId, id));
        roleMapper.deleteById(id);
        redisTemplate.delete(REDIS_PERM_ROLE + id);
        affectedUserIds.forEach(permissionService::evictUserCache);

        // Publish role deleted event
        eventPublisher.publish(EventTopics.ROLE_EVENTS,
                RolePermissionEvent.roleDeleted(
                        role.getTenantId(), id, role.getCode(),
                        affectedUserIds, AppContextHolder.getUserId()));
    }

    private Set<String> normalizeAndValidatePermissions(Collection<String> permissions) {
        Set<String> normalized = workspacePermissionCatalogService.normalizePermissions(permissions);
        workspacePermissionCatalogService.validateAssignablePermissions(normalized);
        return normalized;
    }

    /**
     * Role data scope is now driven entirely by role-level project/group selections.
     * Empty scoped configs would create users that can log in but see no deterministic data set,
     * so we block them at save time instead of keeping a dead configuration option around.
     */
    private DataScopeConfig normalizeDataScopeConfig(DataScopeType scopeType, DataScopeConfig config) {
        DataScopeType effectiveScope = scopeType == null ? DataScopeType.PROJECT : scopeType;
        if (effectiveScope == DataScopeType.ALL || effectiveScope == DataScopeType.SELF) {
            return null;
        }

        DataScopeConfig normalized = new DataScopeConfig();
        List<Long> projectIds = config == null ? List.of() : normalizeProjectIds(config.getProjectIds());
        List<String> groupIds = config == null ? List.of() : normalizeGroupIds(config.getGroupIds());
        normalized.setProjectIds(projectIds);
        normalized.setGroupIds(groupIds);

        if (effectiveScope == DataScopeType.PROJECT && projectIds.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "PROJECT 数据范围至少选择一个项目");
        }
        if (effectiveScope == DataScopeType.GROUP && groupIds.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "GROUP 数据范围至少选择一个设备分组");
        }
        if (effectiveScope == DataScopeType.CUSTOM && projectIds.isEmpty() && groupIds.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "CUSTOM 数据范围至少选择一个项目或设备分组");
        }
        return normalized;
    }

    private List<Long> normalizeProjectIds(List<Long> projectIds) {
        if (projectIds == null || projectIds.isEmpty()) {
            return List.of();
        }
        return projectIds.stream()
                .filter(Objects::nonNull)
                .filter(id -> id > 0)
                .distinct()
                .toList();
    }

    private List<String> normalizeGroupIds(List<String> groupIds) {
        if (groupIds == null || groupIds.isEmpty()) {
            return List.of();
        }
        return groupIds.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(item -> !item.isEmpty())
                .distinct()
                .toList();
    }

    private Role requireRoleInCurrentTenant(Long roleId) {
        Role role = roleMapper.selectById(roleId);
        if (role == null) {
            throw new BizException(ResultCode.ROLE_NOT_FOUND);
        }
        Long tenantId = requireTenantId();
        if (!tenantId.equals(role.getTenantId())) {
            throw new BizException(ResultCode.PERMISSION_DENIED, "role does not belong to current tenant");
        }
        return role;
    }

    private Long requireTenantId() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "tenant context required");
        }
        return tenantId;
    }

    private Set<String> getRolePermissionSet(Long roleId) {
        return rolePermissionMapper.selectList(
                        new LambdaQueryWrapper<RolePermission>().eq(RolePermission::getRoleId, roleId))
                .stream()
                .map(RolePermission::getPermission)
                .filter(permission -> permission != null && !permission.isBlank())
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private Map<Long, Set<String>> loadRolePermissionMap(List<Long> roleIds) {
        if (roleIds == null || roleIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, Set<String>> permissionMap = new LinkedHashMap<>();
        for (RolePermission rolePermission : rolePermissionMapper.selectList(
                new LambdaQueryWrapper<RolePermission>().in(RolePermission::getRoleId, roleIds))) {
            if (rolePermission.getPermission() == null || rolePermission.getPermission().isBlank()) {
                continue;
            }
            permissionMap.computeIfAbsent(rolePermission.getRoleId(), ignored -> new LinkedHashSet<>())
                    .add(rolePermission.getPermission());
        }
        return permissionMap;
    }

    private Map<Long, Integer> countUsersByRoleIds(List<Long> roleIds) {
        if (roleIds == null || roleIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, Integer> userCountMap = new LinkedHashMap<>();
        for (UserRole userRole : userRoleMapper.selectList(
                new LambdaQueryWrapper<UserRole>().in(UserRole::getRoleId, roleIds))) {
            userCountMap.merge(userRole.getRoleId(), 1, Integer::sum);
        }
        return userCountMap;
    }

    private RoleVO toRoleVO(Role role, Collection<String> permissions, int userCount) {
        RoleVO vo = RoleConvert.INSTANCE.toVO(role);
        vo.setPermissions(new ArrayList<>(workspacePermissionCatalogService.normalizePermissions(permissions)));
        vo.setUserCount(userCount);
        return vo;
    }

}
