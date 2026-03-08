package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.common.context.UserContextHolder;
import com.songhg.firefly.iot.common.event.EventPublisher;
import com.songhg.firefly.iot.common.event.EventTopics;
import com.songhg.firefly.iot.common.event.RolePermissionEvent;
import com.songhg.firefly.iot.common.enums.DataScopeType;
import com.songhg.firefly.iot.common.enums.RoleStatus;
import com.songhg.firefly.iot.common.enums.RoleType;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.convert.UserConvert;
import com.songhg.firefly.iot.system.dto.role.RoleCreateDTO;
import com.songhg.firefly.iot.system.dto.role.RoleQueryDTO;
import com.songhg.firefly.iot.system.dto.role.RoleUpdateDTO;
import com.songhg.firefly.iot.system.dto.role.RoleVO;
import com.songhg.firefly.iot.system.dto.user.UserVO;
import com.songhg.firefly.iot.system.entity.Role;
import com.songhg.firefly.iot.system.entity.User;
import com.songhg.firefly.iot.system.entity.RolePermission;
import com.songhg.firefly.iot.system.entity.UserRole;
import com.songhg.firefly.iot.system.convert.RoleConvert;
import com.songhg.firefly.iot.system.mapper.RoleMapper;
import com.songhg.firefly.iot.system.mapper.UserMapper;
import com.songhg.firefly.iot.system.mapper.RolePermissionMapper;
import com.songhg.firefly.iot.system.mapper.UserRoleMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
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

    @Transactional
    public RoleVO createRole(RoleCreateDTO dto) {
        Long tenantId = TenantContextHolder.getTenantId();
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
        role.setCreatedBy(UserContextHolder.getUserId());
        if (role.getDataScope() == null) {
            role.setDataScope(DataScopeType.PROJECT);
        }
        roleMapper.insert(role);

        // Insert permissions
        insertPermissions(role.getId(), dto.getPermissions());

        RoleVO vo = RoleConvert.INSTANCE.toVO(role);
        vo.setPermissions(dto.getPermissions());
        return vo;
    }

    public RoleVO getRoleById(Long id) {
        Role role = roleMapper.selectById(id);
        if (role == null) {
            throw new BizException(ResultCode.ROLE_NOT_FOUND);
        }
        List<String> perms = rolePermissionMapper.selectList(
                        new LambdaQueryWrapper<RolePermission>().eq(RolePermission::getRoleId, id))
                .stream().map(RolePermission::getPermission).collect(Collectors.toList());
        RoleVO vo = RoleConvert.INSTANCE.toVO(role);
        vo.setPermissions(perms);
        return vo;
    }

    public IPage<RoleVO> listRoles(RoleQueryDTO query) {
        Page<Role> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<Role> wrapper = new LambdaQueryWrapper<>();
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
        return result.convert(RoleConvert.INSTANCE::toVO);
    }

    @Transactional
    public RoleVO updateRole(Long id, RoleUpdateDTO dto) {
        Role role = roleMapper.selectById(id);
        if (role == null) {
            throw new BizException(ResultCode.ROLE_NOT_FOUND);
        }
        if (Boolean.TRUE.equals(role.getSystemFlag())) {
            throw new BizException(ResultCode.ROLE_IS_SYSTEM);
        }
        RoleConvert.INSTANCE.updateEntity(dto, role);
        roleMapper.updateById(role);

        // Update permissions
        if (dto.getPermissions() != null) {
            rolePermissionMapper.delete(
                    new LambdaQueryWrapper<RolePermission>().eq(RolePermission::getRoleId, id));
            insertPermissions(id, dto.getPermissions());

            // Evict cache
            redisTemplate.delete(REDIS_PERM_ROLE + id);
            evictAffectedUserCaches(id);

            // Publish permission changed event
            eventPublisher.publish(EventTopics.PERMISSION_EVENTS,
                    RolePermissionEvent.permissionsChanged(
                            role.getTenantId(), id, role.getCode(),
                            dto.getPermissions(), UserContextHolder.getUserId()));
        }

        RoleVO updated = RoleConvert.INSTANCE.toVO(role);
        updated.setPermissions(dto.getPermissions());
        return updated;
    }

    private void evictAffectedUserCaches(Long roleId) {
        userRoleMapper.selectList(
                new LambdaQueryWrapper<UserRole>().eq(UserRole::getRoleId, roleId))
                .stream().map(UserRole::getUserId)
                .forEach(permissionService::evictUserCache);
    }

    private void insertPermissions(Long roleId, List<String> permissions) {
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
        Role role = roleMapper.selectById(roleId);
        if (role == null) {
            throw new BizException(ResultCode.ROLE_NOT_FOUND);
        }
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
        Role role = roleMapper.selectById(id);
        if (role == null) {
            throw new BizException(ResultCode.ROLE_NOT_FOUND);
        }
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
                        affectedUserIds, UserContextHolder.getUserId()));
    }

}
