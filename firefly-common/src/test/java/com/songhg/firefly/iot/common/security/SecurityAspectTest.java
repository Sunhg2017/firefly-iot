package com.songhg.firefly.iot.common.security;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import org.aspectj.lang.JoinPoint;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 回归测试：权限检查器与 Redis 权限来源都缺失时必须 fail-closed，不能放行。
 */
class SecurityAspectTest {

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void deniesWhenNoPermissionSourceAvailable() {
        SecurityAspect aspect = new SecurityAspect();
        AppContextHolder.setTenantId(1L);
        AppContextHolder.setUserId(2L);

        RequiresPermission requiresPermission = mock(RequiresPermission.class);
        when(requiresPermission.value()).thenReturn(new String[]{"device:delete"});
        when(requiresPermission.logical()).thenReturn(RequiresPermission.Logical.AND);

        assertThrows(BizException.class,
                () -> aspect.checkPermission(mock(JoinPoint.class), requiresPermission));
    }
}
