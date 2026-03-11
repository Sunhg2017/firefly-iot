package com.songhg.firefly.iot.system.controller;

import com.songhg.firefly.iot.system.dto.UserSessionVO;
import com.songhg.firefly.iot.system.service.AuthService;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "管理员会话管理", description = "管理员查看/踢出用户会话")
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class AdminSessionController {

    private final AuthService authService;

    @Operation(summary = "查看用户会话列表")
    @GetMapping("/{userId}/sessions")
    @RequiresPermission("user:read")
    public R<List<UserSessionVO>> getUserSessions(@Parameter(description = "用户编号", required = true) @PathVariable Long userId) {
        return R.ok(authService.getAdminUserSessions(userId));
    }

    @Operation(summary = "强制踢出用户")
    @PostMapping("/{userId}/kick")
    @RequiresPermission("user:update")
    public R<Void> kickUser(@Parameter(description = "用户编号", required = true) @PathVariable Long userId) {
        Long operatorId = AppContextHolder.getUserId();
        authService.adminKickUser(userId, operatorId);
        return R.ok();
    }
}
