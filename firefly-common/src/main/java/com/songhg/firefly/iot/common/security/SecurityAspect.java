package com.songhg.firefly.iot.common.security;

import com.songhg.firefly.iot.common.context.UserContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;

/**
 * 安全切面：拦截 @RequiresLogin 和 @RequiresPermission 注解，执行认证和授权检查。
 */
@Slf4j
@Aspect
@Component
public class SecurityAspect {

    @Autowired(required = false)
    private PermissionChecker permissionChecker;

    /**
     * 拦截 @RequiresLogin 注解 (方法级和类级)
     */
    @Before("@annotation(com.songhg.firefly.iot.common.security.RequiresLogin) || @within(com.songhg.firefly.iot.common.security.RequiresLogin)")
    public void checkLogin(JoinPoint joinPoint) {
        Long userId = UserContextHolder.getUserId();
        if (userId == null) {
            throw new BizException(ResultCode.UNAUTHORIZED);
        }
    }

    /**
     * 拦截 @RequiresPermission 注解 (方法级)
     */
    @Before("@annotation(requiresPermission)")
    public void checkPermission(JoinPoint joinPoint, RequiresPermission requiresPermission) {
        // 先检查登录
        Long userId = UserContextHolder.getUserId();
        if (userId == null) {
            throw new BizException(ResultCode.UNAUTHORIZED);
        }

        if (permissionChecker == null) {
            log.warn("PermissionChecker not configured, skipping permission check");
            return;
        }

        String[] permissions = requiresPermission.value();
        RequiresPermission.Logical logical = requiresPermission.logical();

        if (permissions.length == 0) {
            return;
        }

        if (logical == RequiresPermission.Logical.AND) {
            for (String perm : permissions) {
                if (!permissionChecker.hasPermission(userId, perm)) {
                    log.warn("Permission denied: userId={}, required={}", userId, perm);
                    throw new BizException(ResultCode.PERMISSION_DENIED);
                }
            }
        } else {
            boolean hasAny = false;
            for (String perm : permissions) {
                if (permissionChecker.hasPermission(userId, perm)) {
                    hasAny = true;
                    break;
                }
            }
            if (!hasAny) {
                log.warn("Permission denied: userId={}, required any of={}", userId, String.join(",", permissions));
                throw new BizException(ResultCode.PERMISSION_DENIED);
            }
        }
    }

    /**
     * 拦截类级 @RequiresPermission 注解
     */
    @Before("@within(requiresPermission) && !@annotation(com.songhg.firefly.iot.common.security.RequiresPermission)")
    public void checkClassPermission(JoinPoint joinPoint, RequiresPermission requiresPermission) {
        checkPermission(joinPoint, requiresPermission);
    }
}
