package com.songhg.firefly.iot.common.security;

import java.util.Set;

/**
 * 权限检查器 SPI。
 * 各业务模块 (firefly-system 等) 提供自己的实现。
 */
public interface PermissionChecker {

    /**
     * 获取用户的所有权限字符串集合
     */
    Set<String> getUserPermissions(Long userId);

    /**
     * 检查用户是否拥有指定权限（支持通配符 *）
     */
    default boolean hasPermission(Long userId, String permission) {
        Set<String> perms = getUserPermissions(userId);
        if (perms == null || perms.isEmpty()) {
            return false;
        }
        if (perms.contains("*") || perms.contains(permission)) {
            return true;
        }
        // 支持通配符匹配: system:* 可匹配 system:user:read
        for (String perm : perms) {
            if (perm.endsWith(":*")) {
                String prefix = perm.substring(0, perm.length() - 1);
                if (permission.startsWith(prefix)) {
                    return true;
                }
            }
        }
        return false;
    }
}
