package com.songhg.firefly.iot.system.service;

import com.songhg.firefly.iot.common.constant.AuthConstants;
import com.songhg.firefly.iot.system.mapper.RolePermissionMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.Collections;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * ACC-004 回归：权限缓存失效后必须能够重建，而不是把合法用户判为无权限。
 */
class PermissionServiceTest {

    private final RolePermissionMapper rolePermissionMapper = mock(RolePermissionMapper.class);
    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final SetOperations<String, String> setOperations = mock(SetOperations.class);
    private final PermissionService service = new PermissionService(rolePermissionMapper, redisTemplate);

    @BeforeEach
    void setUp() {
        when(redisTemplate.opsForSet()).thenReturn(setOperations);
        when(redisTemplate.hasKey(anyString())).thenReturn(false);
        when(setOperations.members(anyString())).thenReturn(Collections.emptySet());
    }

    @Test
    void l1HitRebuildsMissingRedisSet() {
        String key = AuthConstants.REDIS_PERM_USER + 1L;
        when(rolePermissionMapper.findPermissionsByUserId(1L)).thenReturn(Set.of("device:read"));

        service.getUserPermissions(1L);
        // 模拟 Redis 集合被逐出后 L1 仍命中
        when(redisTemplate.hasKey(key)).thenReturn(false);
        Set<String> permissions = service.getUserPermissions(1L);

        assertEquals(Set.of("device:read"), permissions);
        verify(setOperations, times(2)).add(eq(key), any(String[].class));
        verify(redisTemplate, atLeast(2)).expire(eq(key), eq(12L), eq(TimeUnit.HOURS));
    }

    @Test
    void refreshRebuildsRedisAfterEviction() {
        String key = AuthConstants.REDIS_PERM_USER + 2L;
        when(rolePermissionMapper.findPermissionsByUserId(2L)).thenReturn(Set.of("device:delete"));

        service.refreshUserPermissions(2L);

        verify(redisTemplate).delete(key);
        verify(setOperations).add(eq(key), any(String[].class));
        assertEquals(Set.of("device:delete"), service.getUserPermissions(2L));
    }

    @Test
    void emptyPermissionSetDoesNotWriteRedis() {
        when(rolePermissionMapper.findPermissionsByUserId(3L)).thenReturn(Collections.emptySet());

        Set<String> permissions = service.getUserPermissions(3L);

        assertEquals(Collections.emptySet(), permissions);
        verify(setOperations, times(0)).add(anyString(), any(String[].class));
    }
}
