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

        // L1: Caffeine。命中时仍需保证 L2 存在：业务服务在无本地 PermissionChecker 时
        // 直接读 Redis 集合做校验，L2 缺失会把合法用户误判为无权限。
        Set<String> perms = l1Cache.getIfPresent(userId);
        if (perms != null) {
            ensureL2Cached(userId, perms);
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
            // 其他业务服务在无本地 PermissionChecker 时直接读取该集合做权限校验，
            // 因此保留期需覆盖正常会话周期；权限变更由 PermissionEventConsumer 主动重建。
            redisTemplate.expire(redisKey, 12, TimeUnit.HOURS);
        }
        l1Cache.put(userId, perms);

        return perms;
    }

    /**
     * 权限变更后重建用户缓存：清 L1、重算数据库权限、回写 L2。
     * 由权限事件消费者调用，保证撤权/授权在 Redis 侧立即生效，而不是等待下一次查询。
     */
    public void refreshUserPermissions(Long userId) {
        if (userId == null) {
            return;
        }
        String redisKey = REDIS_PERM_USER + userId;
        l1Cache.invalidate(userId);
        redisTemplate.delete(redisKey);
        Set<String> perms = rolePermissionMapper.findPermissionsByUserId(userId);
        if (perms == null) {
            perms = Collections.emptySet();
        }
        if (!perms.isEmpty()) {
            redisTemplate.opsForSet().add(redisKey, perms.toArray(new String[0]));
            redisTemplate.expire(redisKey, 12, TimeUnit.HOURS);
        }
        l1Cache.put(userId, perms);
        log.info("Permission cache refreshed: userId={}, permissionCount={}", userId, perms.size());
    }

    private void ensureL2Cached(Long userId, Set<String> permissions) {
        if (permissions == null || permissions.isEmpty()) {
            return;
        }
        String redisKey = REDIS_PERM_USER + userId;
        try {
            if (Boolean.TRUE.equals(redisTemplate.hasKey(redisKey))) {
                return;
            }
            redisTemplate.opsForSet().add(redisKey, permissions.toArray(new String[0]));
            redisTemplate.expire(redisKey, 12, TimeUnit.HOURS);
            log.info("Rebuilt missing permission cache from L1: userId={}", userId);
        } catch (Exception ex) {
            // L2 不可用时保持 L1 结果，避免因缓存故障放大为业务不可用。
            log.warn("Failed to rebuild permission cache for userId={}: {}", userId, ex.getMessage());
        }
    }
}
