package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.RoleStatus;
import com.songhg.firefly.iot.common.enums.UserStatus;
import com.songhg.firefly.iot.common.enums.UserType;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.convert.UserConvert;
import com.songhg.firefly.iot.system.dto.user.UserCreateDTO;
import com.songhg.firefly.iot.system.dto.user.UserOptionVO;
import com.songhg.firefly.iot.system.dto.user.UserQueryDTO;
import com.songhg.firefly.iot.system.dto.user.UserUpdateDTO;
import com.songhg.firefly.iot.system.dto.user.UserVO;
import com.songhg.firefly.iot.system.entity.Role;
import com.songhg.firefly.iot.system.entity.User;
import com.songhg.firefly.iot.system.entity.UserRole;
import com.songhg.firefly.iot.system.mapper.RoleMapper;
import com.songhg.firefly.iot.system.mapper.UserMapper;
import com.songhg.firefly.iot.system.mapper.UserRoleMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserMapper userMapper;
    private final UserRoleMapper userRoleMapper;
    private final RoleMapper roleMapper;
    private final PasswordEncoder passwordEncoder;
    private final UserDomainService userDomainService;

    @Transactional
    public UserVO createUser(UserCreateDTO dto) {
        Long tenantId = requireTenantId();
        User operator = userDomainService.requireCurrentUser();
        UserType userType = resolveCreatedUserType(dto.getUserType(), tenantId, operator);

        Long count = userMapper.selectCount(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, dto.getUsername())
                .isNull(User::getDeletedAt));
        if (count > 0) {
            throw new BizException(ResultCode.USER_EXISTS);
        }

        User user = UserConvert.INSTANCE.toEntity(dto);
        user.setTenantId(tenantId);
        user.setUserType(userType);
        user.setStatus(UserStatus.ACTIVE);
        user.setLoginFailCount(0);

        String rawPassword = dto.getPassword() != null ? dto.getPassword() : generateRandomPassword();
        user.setPasswordHash(passwordEncoder.encode(rawPassword));
        user.setPasswordChangedAt(LocalDateTime.now());
        user.setCreatedBy(operator.getId());
        userMapper.insert(user);

        replaceUserRoles(user.getId(), tenantId, dto.getRoles());

        log.info("User created: id={}, username={}, tenantId={}", user.getId(), user.getUsername(), tenantId);
        return enrichUserVO(user);
    }

    public UserVO getUserById(Long id) {
        User user = requireUserInCurrentTenant(id);
        return enrichUserVO(user);
    }

    public IPage<UserVO> listUsers(UserQueryDTO query) {
        Long tenantId = requireTenantId();

        LambdaQueryWrapper<User> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(User::getTenantId, tenantId);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.and(w -> w.like(User::getUsername, query.getKeyword())
                    .or().like(User::getRealName, query.getKeyword())
                    .or().like(User::getPhone, query.getKeyword()));
        }
        if (query.getStatus() != null) {
            wrapper.eq(User::getStatus, query.getStatus());
        }
        if (query.getRoleId() != null) {
            List<Long> matchedUserIds = userRoleMapper.selectList(new LambdaQueryWrapper<UserRole>()
                            .eq(UserRole::getRoleId, query.getRoleId()))
                    .stream()
                    .map(UserRole::getUserId)
                    .distinct()
                    .toList();
            if (matchedUserIds.isEmpty()) {
                Page<UserVO> empty = new Page<>(query.getPageNum(), query.getPageSize());
                empty.setRecords(List.of());
                empty.setTotal(0);
                return empty;
            }
            wrapper.in(User::getId, matchedUserIds);
        }
        wrapper.isNull(User::getDeletedAt);
        wrapper.orderByDesc(User::getCreatedAt);

        Page<User> page = new Page<>(query.getPageNum(), query.getPageSize());
        IPage<User> result = userMapper.selectPage(page, wrapper);

        Map<Long, List<UserVO.UserRoleVO>> roleMap = buildUserRoleMap(
                result.getRecords().stream().map(User::getId).toList());
        return result.convert(user -> toUserVO(user, roleMap.getOrDefault(user.getId(), List.of())));
    }

    @Transactional
    public UserVO updateUser(Long id, UserUpdateDTO dto) {
        User user = requireUserInCurrentTenant(id);
        UserConvert.INSTANCE.updateEntity(dto, user);
        userMapper.updateById(user);
        return enrichUserVO(user);
    }

    @Transactional
    public void updateUserStatus(Long id, UserStatus status) {
        User user = requireUserInCurrentTenant(id);
        user.setStatus(status);
        userMapper.updateById(user);
    }

    @Transactional
    public void deleteUser(Long id) {
        User user = requireUserInCurrentTenant(id);
        user.setStatus(UserStatus.DISABLED);
        userMapper.updateById(user);
        userRoleMapper.delete(new LambdaQueryWrapper<UserRole>().eq(UserRole::getUserId, user.getId()));
        userMapper.deleteById(user.getId());
    }

    @Transactional
    public void assignRoles(Long userId, List<UserCreateDTO.UserRoleDTO> roles) {
        User user = requireUserInCurrentTenant(userId);
        replaceUserRoles(userId, user.getTenantId(), roles);
    }

    @Transactional
    public void resetPassword(Long id, String newPassword) {
        User user = requireUserInCurrentTenant(id);
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setPasswordChangedAt(LocalDateTime.now());
        userMapper.updateById(user);
    }

    @Transactional
    public void changePassword(Long userId, String oldPassword, String newPassword) {
        User user = requireUserInCurrentTenant(userId);
        if (!passwordEncoder.matches(oldPassword, user.getPasswordHash())) {
            throw new BizException(ResultCode.PARAM_ERROR, "旧密码不正确");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setPasswordChangedAt(LocalDateTime.now());
        userMapper.updateById(user);
    }

    public List<UserCreateDTO.UserRoleDTO> getUserRoles(Long userId) {
        User user = requireUserInCurrentTenant(userId);
        return userRoleMapper.selectList(
                        new LambdaQueryWrapper<UserRole>().eq(UserRole::getUserId, user.getId()))
                .stream()
                .map(userRole -> {
                    UserCreateDTO.UserRoleDTO dto = new UserCreateDTO.UserRoleDTO();
                    dto.setRoleId(userRole.getRoleId());
                    dto.setProjectId(userRole.getProjectId());
                    return dto;
                })
                .toList();
    }

    public List<UserOptionVO> listSelectableUsers() {
        Long tenantId = requireTenantId();
        return userMapper.selectList(new LambdaQueryWrapper<User>()
                        .select(User::getUsername, User::getRealName, User::getPhone, User::getEmail, User::getStatus)
                        .eq(User::getTenantId, tenantId)
                        .eq(User::getStatus, UserStatus.ACTIVE)
                        .isNull(User::getDeletedAt)
                        .orderByAsc(User::getRealName)
                        .orderByAsc(User::getUsername))
                .stream()
                .map(user -> {
                    UserOptionVO option = new UserOptionVO();
                    option.setUsername(user.getUsername());
                    option.setRealName(user.getRealName());
                    option.setPhone(user.getPhone());
                    option.setEmail(user.getEmail());
                    option.setStatus(user.getStatus());
                    return option;
                })
                .filter(option -> Objects.nonNull(option.getUsername()))
                .toList();
    }

    private void replaceUserRoles(Long userId, Long tenantId, List<UserCreateDTO.UserRoleDTO> roles) {
        userRoleMapper.delete(new LambdaQueryWrapper<UserRole>().eq(UserRole::getUserId, userId));
        if (roles == null || roles.isEmpty()) {
            return;
        }
        for (UserCreateDTO.UserRoleDTO roleDTO : roles) {
            ensureRoleInTenant(roleDTO.getRoleId(), tenantId);
            UserRole userRole = new UserRole();
            userRole.setUserId(userId);
            userRole.setRoleId(roleDTO.getRoleId());
            userRole.setProjectId(roleDTO.getProjectId());
            userRole.setCreatedAt(LocalDateTime.now());
            userRoleMapper.insert(userRole);
        }
    }

    private UserVO enrichUserVO(User user) {
        Map<Long, List<UserVO.UserRoleVO>> roleMap = buildUserRoleMap(List.of(user.getId()));
        return toUserVO(user, roleMap.getOrDefault(user.getId(), List.of()));
    }

    private Map<Long, List<UserVO.UserRoleVO>> buildUserRoleMap(List<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Map.of();
        }

        List<UserRole> userRoles = userRoleMapper.selectList(
                new LambdaQueryWrapper<UserRole>().in(UserRole::getUserId, userIds));
        if (userRoles.isEmpty()) {
            return Map.of();
        }

        Map<Long, Role> roleMap = roleMapper.selectBatchIds(
                        userRoles.stream().map(UserRole::getRoleId).distinct().toList())
                .stream()
                .collect(Collectors.toMap(Role::getId, role -> role));

        Map<Long, List<UserVO.UserRoleVO>> result = new LinkedHashMap<>();
        for (UserRole userRole : userRoles) {
            Role role = roleMap.get(userRole.getRoleId());
            if (role == null) {
                continue;
            }
            UserVO.UserRoleVO roleVO = new UserVO.UserRoleVO();
            roleVO.setRoleId(role.getId());
            roleVO.setRoleCode(role.getCode());
            roleVO.setRoleName(role.getName());
            roleVO.setProjectId(userRole.getProjectId());
            result.computeIfAbsent(userRole.getUserId(), ignored -> new ArrayList<>()).add(roleVO);
        }
        return result;
    }

    private UserVO toUserVO(User user, List<UserVO.UserRoleVO> roles) {
        requireUserType(user);
        UserVO result = UserConvert.INSTANCE.toVO(user);
        result.setRoles(roles);
        result.setTenantSuperAdmin(userDomainService.isTenantSuperAdmin(user.getId(), user.getTenantId()));
        return result;
    }

    private String generateRandomPassword() {
        return "Ffly@" + System.currentTimeMillis() % 100000;
    }

    private void requireUserType(User user) {
        if (user.getUserType() != null) {
            return;
        }
        log.error("User userType is missing at query: userId={}, tenantId={}", user.getId(), user.getTenantId());
        throw new BizException(ResultCode.INTERNAL_ERROR, "userType is required");
    }

    private UserType resolveCreatedUserType(UserType requestedType, Long tenantId, User operator) {
        UserType resolvedType = requestedType;
        if (userDomainService.isPlatformTenant(tenantId)) {
            if (resolvedType == null) {
                resolvedType = UserType.SYSTEM_OPS;
            }
            if (resolvedType != UserType.SYSTEM_OPS) {
                throw new BizException(ResultCode.PERMISSION_DENIED, "platform tenant only allows SYSTEM_OPS users");
            }
            userDomainService.assertCurrentUserIsSystemSuperAdmin();
            return resolvedType;
        }

        if (resolvedType == null) {
            resolvedType = UserType.TENANT_USER;
        }
        if (resolvedType != UserType.TENANT_USER) {
            throw new BizException(ResultCode.PERMISSION_DENIED, "tenant only allows TENANT_USER users");
        }
        if (operator.getUserType() != UserType.SYSTEM_OPS && operator.getUserType() != UserType.TENANT_USER) {
            throw new BizException(ResultCode.PERMISSION_DENIED, "unsupported operator user type");
        }
        return resolvedType;
    }

    private void ensureRoleInTenant(Long roleId, Long tenantId) {
        if (roleId == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "roleId is required");
        }
        Role role = roleMapper.selectById(roleId);
        if (role == null) {
            throw new BizException(ResultCode.ROLE_NOT_FOUND);
        }
        if (!tenantId.equals(role.getTenantId())) {
            throw new BizException(ResultCode.PERMISSION_DENIED, "role does not belong to current tenant");
        }
        if (role.getStatus() == RoleStatus.DISABLED) {
            throw new BizException(ResultCode.PERMISSION_DENIED, "role is disabled");
        }
    }

    private User requireUserInCurrentTenant(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null || user.getDeletedAt() != null) {
            throw new BizException(ResultCode.USER_NOT_FOUND);
        }
        Long tenantId = requireTenantId();
        if (!tenantId.equals(user.getTenantId())) {
            throw new BizException(ResultCode.PERMISSION_DENIED, "user does not belong to current tenant");
        }
        return user;
    }

    private Long requireTenantId() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null || tenantId <= 0) {
            throw new BizException(ResultCode.PARAM_ERROR, "tenant context required");
        }
        return tenantId;
    }
}
