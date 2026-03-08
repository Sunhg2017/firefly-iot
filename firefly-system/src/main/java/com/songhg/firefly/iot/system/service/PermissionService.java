package com.songhg.firefly.iot.system.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.songhg.firefly.iot.common.security.PermissionChecker;
import com.songhg.firefly.iot.system.mapper.RolePermissionMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import static com.songhg.firefly.iot.common.constant.AuthConstants.REDIS_PERM_USER;

/**
 * 权限服务：实现 PermissionChecker SPI。
 * 使用 Caffeine L1 + Redis L2 双层缓存。
 */
@Slf4j
@Service
public class PermissionService implements PermissionChecker {

    private final RolePermissionMapper rolePermissionMapper;
    private final StringRedisTemplate redisTemplate;

    private final Cache<Long, Set<String>> l1Cache = Caffeine.newBuilder()
            .maximumSize(1000)
            .expireAfterWrite(5, TimeUnit.MINUTES)
            .build();

    public PermissionService(RolePermissionMapper rolePermissionMapper,
                             StringRedisTemplate redisTemplate) {
        this.rolePermissionMapper = rolePermissionMapper;
        this.redisTemplate = redisTemplate;
    }

    /**
     * 清除指定用户的权限缓存（L1 + L2）
     */
    public void evictUserCache(Long userId) {
        l1Cache.invalidate(userId);
        redisTemplate.delete(REDIS_PERM_USER + userId);
    }

    /**
     * 清除所有用户的 L1 权限缓存
     */
    public void evictAllL1Cache() {
        l1Cache.invalidateAll();
    }

    @Override
    public Set<String> getUserPermissions(Long userId) {
        if (userId == null) {
            return Collections.emptySet();
        }

        // L1: Caffeine
        Set<String> perms = l1Cache.getIfPresent(userId);
        if (perms != null) {
            return perms;
        }

        // L2: Redis
        String redisKey = REDIS_PERM_USER + userId;
        Set<String> redisPerms = redisTemplate.opsForSet().members(redisKey);
        if (redisPerms != null && !redisPerms.isEmpty()) {
            l1Cache.put(userId, redisPerms);
            return redisPerms;
        }

        // DB
        perms = rolePermissionMapper.findPermissionsByUserId(userId);
        if (perms == null) {
            perms = Collections.emptySet();
        }

        // 回填缓存
        if (!perms.isEmpty()) {
            redisTemplate.opsForSet().add(redisKey, perms.toArray(new String[0]));
            redisTemplate.expire(redisKey, 30, TimeUnit.MINUTES);
        }
        l1Cache.put(userId, perms);

        return perms;
    }
}
