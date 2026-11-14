package com.songhg.firefly.iot.system.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.system.service.PermissionService;
import io.swagger.v3.oas.annotations.Hidden;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Set;

/**
 * 内部权限查询接口：供网关在业务服务 Redis 权限集合缺失时触发重建。
 * 路径位于 /api/v1/internal/**，由服务令牌拦截器保护。
 */
@Hidden
@RestController
@RequestMapping("/api/v1/internal/permissions")
@RequiredArgsConstructor
public class PermissionInternalController {

    private final PermissionService permissionService;

    @GetMapping("/users/{userId}")
    public R<Set<String>> getUserPermissions(@PathVariable Long userId) {
        return R.ok(permissionService.getUserPermissions(userId));
    }
}
