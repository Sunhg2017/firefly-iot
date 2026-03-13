package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.UserStatus;
import com.songhg.firefly.iot.common.enums.UserType;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.mybatis.DataScope;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.dto.user.UserCreateDTO;
import com.songhg.firefly.iot.system.dto.user.UserOptionVO;
import com.songhg.firefly.iot.system.dto.user.UserQueryDTO;
import com.songhg.firefly.iot.system.dto.user.UserUpdateDTO;
import com.songhg.firefly.iot.system.dto.user.UserVO;
import com.songhg.firefly.iot.system.entity.Role;
import com.songhg.firefly.iot.system.entity.User;
import com.songhg.firefly.iot.system.entity.UserRole;
import com.songhg.firefly.iot.system.convert.UserConvert;
import com.songhg.firefly.iot.system.mapper.RoleMapper;
import com.songhg.firefly.iot.system.mapper.UserMapper;
import com.songhg.firefly.iot.system.mapper.UserRoleMapper;
import lombok.RequiredArgsConstructor;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

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
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "tenant context required");
        }

        User operator = userDomainService.requireCurrentUser();
        UserType userType = resolveCreatedUserType(dto.getUserType(), tenantId, operator);

        // Check uniqueness
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

        // Assign roles
        if (dto.getRoles() != null) {
            for (UserCreateDTO.UserRoleDTO roleDTO : dto.getRoles()) {
                ensureRoleInTenant(roleDTO.getRoleId(), tenantId);
                UserRole ur = new UserRole();
                ur.setUserId(user.getId());
                ur.setRoleId(roleDTO.getRoleId());
                ur.setProjectId(roleDTO.getProjectId());
                ur.setCreatedAt(LocalDateTime.now());
                userRoleMapper.insert(ur);
            }
        }

        log.info("User created: id={}, username={}, tenantId={}", user.getId(), user.getUsername(), tenantId);
        return UserConvert.INSTANCE.toVO(user);
    }

    public UserVO getUserById(Long id) {
        User user = userMapper.selectOne(
                new LambdaQueryWrapper<User>()
                        .select(User::getId, User::getTenantId, User::getUsername, User::getPhone,
                                User::getEmail, User::getAvatarUrl, User::getRealName, User::getUserType, User::getStatus)
                        .eq(User::getId, id)
                        .isNull(User::getDeletedAt)
                        .last("LIMIT 1"));
        if (user == null) {
            throw new BizException(ResultCode.USER_NOT_FOUND);
        }
        requireUserType(user);
        UserVO result = UserConvert.INSTANCE.toVO(user);
        result.setTenantSuperAdmin(userDomainService.isTenantSuperAdmin(user.getId(), user.getTenantId()));
        result.setWorkspaceMenuAdmin(
                userDomainService.isPlatformSuperAdmin(user.getId())
                        || userDomainService.isTenantSuperAdmin(user.getId(), user.getTenantId()));
        return result;
    }

    @DataScope(createdByColumn = "created_by")
    public IPage<UserVO> listUsers(UserQueryDTO query) {
        LambdaQueryWrapper<User> wrapper = new LambdaQueryWrapper<>();
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.and(w -> w.like(User::getUsername, query.getKeyword())
                    .or().like(User::getRealName, query.getKeyword())
                    .or().like(User::getPhone, query.getKeyword()));
        }
        if (query.getStatus() != null) {
            wrapper.eq(User::getStatus, query.getStatus());
        }
        wrapper.isNull(User::getDeletedAt);
        wrapper.orderByDesc(User::getCreatedAt);

        Page<User> page = new Page<>(query.getPageNum(), query.getPageSize());
        IPage<User> result = userMapper.selectPage(page, wrapper);
        return result.convert(UserConvert.INSTANCE::toVO);
    }

    @Transactional
    public UserVO updateUser(Long id, UserUpdateDTO dto) {
        User user = userMapper.selectById(id);
        if (user == null || user.getDeletedAt() != null) {
            throw new BizException(ResultCode.USER_NOT_FOUND);
        }
        UserConvert.INSTANCE.updateEntity(dto, user);
        userMapper.updateById(user);
        return UserConvert.INSTANCE.toVO(user);
    }

    @Transactional
    public void updateUserStatus(Long id, UserStatus status) {
        User user = userMapper.selectById(id);
        if (user == null || user.getDeletedAt() != null) {
            throw new BizException(ResultCode.USER_NOT_FOUND);
        }
        user.setStatus(status);
        userMapper.updateById(user);
    }

    @Transactional
    public void deleteUser(Long id) {
        User user = userMapper.selectById(id);
        if (user == null || user.getDeletedAt() != null) {
            throw new BizException(ResultCode.USER_NOT_FOUND);
        }
        user.setStatus(UserStatus.DISABLED);
        userMapper.updateById(user);
        userMapper.deleteById(user.getId());
    }

    @Transactional
    public void assignRoles(Long userId, List<UserCreateDTO.UserRoleDTO> roles) {
        User user = userMapper.selectById(userId);
        if (user == null || user.getDeletedAt() != null) {
            throw new BizException(ResultCode.USER_NOT_FOUND);
        }
        // Remove existing roles
        userRoleMapper.delete(new LambdaQueryWrapper<UserRole>().eq(UserRole::getUserId, userId));
        // Insert new roles
        if (roles != null) {
            for (UserCreateDTO.UserRoleDTO roleDTO : roles) {
                ensureRoleInTenant(roleDTO.getRoleId(), user.getTenantId());
                UserRole ur = new UserRole();
                ur.setUserId(userId);
                ur.setRoleId(roleDTO.getRoleId());
                ur.setProjectId(roleDTO.getProjectId());
                ur.setCreatedAt(LocalDateTime.now());
                userRoleMapper.insert(ur);
            }
        }
    }

    @Transactional
    public void resetPassword(Long id, String newPassword) {
        User user = userMapper.selectById(id);
        if (user == null || user.getDeletedAt() != null) {
            throw new BizException(ResultCode.USER_NOT_FOUND);
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setPasswordChangedAt(LocalDateTime.now());
        userMapper.updateById(user);
    }

    @Transactional
    public void changePassword(Long userId, String oldPassword, String newPassword) {
        User user = userMapper.selectById(userId);
        if (user == null || user.getDeletedAt() != null) {
            throw new BizException(ResultCode.USER_NOT_FOUND);
        }
        if (!passwordEncoder.matches(oldPassword, user.getPasswordHash())) {
            throw new BizException(ResultCode.PARAM_ERROR, "旧密码不正确");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setPasswordChangedAt(LocalDateTime.now());
        userMapper.updateById(user);
    }

    public List<UserCreateDTO.UserRoleDTO> getUserRoles(Long userId) {
        List<UserRole> roles = userRoleMapper.selectList(
                new LambdaQueryWrapper<UserRole>().eq(UserRole::getUserId, userId));
        return roles.stream().map(ur -> {
            UserCreateDTO.UserRoleDTO dto = new UserCreateDTO.UserRoleDTO();
            dto.setRoleId(ur.getRoleId());
            dto.setProjectId(ur.getProjectId());
            return dto;
        }).collect(Collectors.toList());
    }

    public List<UserOptionVO> listSelectableUsers() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null || tenantId <= 0) {
            throw new BizException(ResultCode.PARAM_ERROR, "tenant context required");
        }

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
    }

}
