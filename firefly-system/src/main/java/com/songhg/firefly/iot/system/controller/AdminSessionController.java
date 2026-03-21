package com.songhg.firefly.iot.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.dto.AdminSessionQueryDTO;
import com.songhg.firefly.iot.system.dto.AdminSessionVO;
import com.songhg.firefly.iot.system.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "管理员会话", description = "分页查看在线管理员会话并执行强制下线")
@RestController
@RequestMapping("/api/v1/admin-sessions")
@RequiredArgsConstructor
public class AdminSessionController {

    private final AuthService authService;

    @Operation(summary = "分页查询管理员会话")
    @PostMapping("/list")
    @RequiresPermission("user:read")
    public R<IPage<AdminSessionVO>> queryAdminSessions(@Valid @RequestBody AdminSessionQueryDTO query) {
        return R.ok(authService.queryAdminSessions(query));
    }

    @Operation(summary = "强制下线管理员单个会话")
    @DeleteMapping("/{sessionId}")
    @RequiresPermission("user:update")
    public R<Void> kickSession(@Parameter(description = "会话编号", required = true) @PathVariable Long sessionId) {
        Long operatorId = AppContextHolder.getUserId();
        authService.adminKickAdminSession(sessionId, operatorId);
        return R.ok();
    }

    @Operation(summary = "强制下线管理员全部会话")
    @PostMapping("/users/{username}/kick")
    @RequiresPermission("user:update")
    public R<Void> kickUser(@Parameter(description = "管理员账号", required = true) @PathVariable String username) {
        Long operatorId = AppContextHolder.getUserId();
        authService.adminKickAdminUserByUsername(username, operatorId);
        return R.ok();
    }
}
