package com.songhg.firefly.iot.common.security;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * Security aspect for login and permission annotations.
 */
@Slf4j
@Aspect
@Component
public class SecurityAspect {

    @Autowired(required = false)
    private PermissionChecker permissionChecker;

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

        if (permissionChecker == null) {
            log.warn("PermissionChecker not configured, skipping permission check");
            return;
        }

        if (requiresPermission.logical() == RequiresPermission.Logical.AND) {
            for (String permission : permissions) {
                if (!permissionChecker.hasPermission(userId, permission)) {
                    log.warn("Permission denied: userId={}, required={}", userId, permission);
                    throw new BizException(ResultCode.PERMISSION_DENIED);
                }
            }
            return;
        }

        for (String permission : permissions) {
            if (permissionChecker.hasPermission(userId, permission)) {
                return;
            }
        }
        log.warn("Permission denied: userId={}, required any of={}", userId, String.join(",", permissions));
        throw new BizException(ResultCode.PERMISSION_DENIED);
    }

    @Before("@within(requiresPermission) && !@annotation(com.songhg.firefly.iot.common.security.RequiresPermission)")
    public void checkClassPermission(JoinPoint joinPoint, RequiresPermission requiresPermission) {
        checkPermission(joinPoint, requiresPermission);
    }

    private void ensureGrantedPermissions(String[] requiredPermissions, RequiresPermission.Logical logical) {
        Set<String> grantedPermissions = AppContextHolder.getPermissions();
        if (grantedPermissions == null || grantedPermissions.isEmpty()) {
            throw new BizException(ResultCode.PERMISSION_DENIED);
        }

        if (logical == RequiresPermission.Logical.AND) {
            for (String requiredPermission : requiredPermissions) {
                if (!matchesPermission(grantedPermissions, requiredPermission)) {
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
