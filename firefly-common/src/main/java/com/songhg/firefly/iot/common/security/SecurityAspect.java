package com.songhg.firefly.iot.common.security;

import com.songhg.firefly.iot.common.constant.AuthConstants;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.Set;

/**
 * Security aspect for login and permission annotations.
 *
 * <p>权限校验必须 fail-closed：本地没有 {@link PermissionChecker} 实现时，
 * 回退读取 system 服务写入 Redis 的用户权限集合；两者都不可用时直接拒绝，
 * 不能因为检查器缺失而放行。</p>
 */
@Slf4j
@Aspect
@Component
public class SecurityAspect {

    @Autowired(required = false)
    private PermissionChecker permissionChecker;

    @Autowired(required = false)
    private StringRedisTemplate redisTemplate;

    @Before("@annotation(com.songhg.firefly.iot.common.security.RequiresLogin) || @within(com.songhg.firefly.iot.common.security.RequiresLogin)")
    public void checkLogin(JoinPoint joinPoint) {
        Long userId = AppContextHolder.getUserId();
        Long appKeyId = AppContextHolder.getAppKeyId();
        if (userId == null && appKeyId == null) {
            throw new BizException(ResultCode.UNAUTHORIZED);
        }
    }

    @Before("@annotation(requiresPermission)")
    public void checkPermission(JoinPoint joinPoint, RequiresPermission requiresPermission) {
        Long userId = AppContextHolder.getUserId();
        Long appKeyId = AppContextHolder.getAppKeyId();
        if (userId == null && appKeyId == null) {
            throw new BizException(ResultCode.UNAUTHORIZED);
        }

        String[] permissions = requiresPermission.value();
        if (permissions.length == 0) {
            return;
        }

        if (appKeyId != null) {
            ensureGrantedPermissions(permissions, requiresPermission.logical());
            return;
        }

        Set<String> grantedPermissions = resolveUserPermissions(userId);
        if (grantedPermissions.isEmpty()) {
            log.warn("Permission denied: userId={}, no permission source available or empty permissions", userId);
            throw new BizException(ResultCode.PERMISSION_DENIED);
        }
        ensurePermissionSet(grantedPermissions, permissions, requiresPermission.logical(), userId);
    }

    @Before("@within(requiresPermission) && !@annotation(com.songhg.firefly.iot.common.security.RequiresPermission)")
    public void checkClassPermission(JoinPoint joinPoint, RequiresPermission requiresPermission) {
        checkPermission(joinPoint, requiresPermission);
    }

    private Set<String> resolveUserPermissions(Long userId) {
        if (permissionChecker != null) {
            Set<String> permissions = permissionChecker.getUserPermissions(userId);
            return permissions == null ? Collections.emptySet() : permissions;
        }
        return readPermissionsFromRedis(userId);
    }

    private Set<String> readPermissionsFromRedis(Long userId) {
        if (redisTemplate == null) {
            return Collections.emptySet();
        }
        try {
            Set<String> permissions = redisTemplate.opsForSet()
                    .members(AuthConstants.REDIS_PERM_USER + userId);
            return permissions == null ? Collections.emptySet() : permissions;
        } catch (Exception ex) {
            log.warn("Failed to read permissions from Redis for userId={}: {}", userId, ex.getMessage());
            return Collections.emptySet();
        }
    }

    private void ensureGrantedPermissions(String[] requiredPermissions, RequiresPermission.Logical logical) {
        Set<String> grantedPermissions = AppContextHolder.getPermissions();
        if (grantedPermissions == null || grantedPermissions.isEmpty()) {
            throw new BizException(ResultCode.PERMISSION_DENIED);
        }
        ensurePermissionSet(grantedPermissions, requiredPermissions, logical, null);
    }

    private void ensurePermissionSet(Set<String> grantedPermissions, String[] requiredPermissions,
                                     RequiresPermission.Logical logical, Long userId) {
        if (logical == RequiresPermission.Logical.AND) {
            for (String requiredPermission : requiredPermissions) {
                if (!matchesPermission(grantedPermissions, requiredPermission)) {
                    log.warn("Permission denied: userId={}, required={}", userId, requiredPermission);
                    throw new BizException(ResultCode.PERMISSION_DENIED);
                }
            }
            return;
        }

        for (String requiredPermission : requiredPermissions) {
            if (matchesPermission(grantedPermissions, requiredPermission)) {
                return;
            }
        }
        log.warn("Permission denied: userId={}, required any of={}", userId, String.join(",", requiredPermissions));
        throw new BizException(ResultCode.PERMISSION_DENIED);
    }

    private boolean matchesPermission(Set<String> grantedPermissions, String requiredPermission) {
        if (grantedPermissions.contains("*") || grantedPermissions.contains(requiredPermission)) {
            return true;
        }
        for (String permission : grantedPermissions) {
            if (permission == null || permission.isBlank()) {
                continue;
            }
            if (permission.endsWith(":*")) {
                String prefix = permission.substring(0, permission.length() - 1);
                if (requiredPermission.startsWith(prefix)) {
                    return true;
                }
            }
        }
        return false;
    }
}
