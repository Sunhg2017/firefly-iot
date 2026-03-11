package com.songhg.firefly.iot.system.controller;

import com.songhg.firefly.iot.system.dto.OauthBindingVO;
import com.songhg.firefly.iot.system.dto.PushTokenUpdateDTO;
import com.songhg.firefly.iot.system.dto.UserSessionVO;
import com.songhg.firefly.iot.system.service.AuthService;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.Platform;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresLogin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "会话与绑定", description = "当前用户会话管理、推送令牌、OAuth 绑定")
@RestController
@RequestMapping("/api/v1/user")
@RequiredArgsConstructor
@RequiresLogin
public class SessionController {

    private final AuthService authService;

    // ==================== Sessions ====================

    @Operation(summary = "查询我的会话列表")
    @GetMapping("/sessions")
    public R<List<UserSessionVO>> mySessions() {
        Long userId = AppContextHolder.getUserId();
        return R.ok(authService.getUserSessionVOs(userId));
    }

    @Operation(summary = "踢出指定会话")
    @DeleteMapping("/sessions/{sessionId}")
    public R<Void> kickSession(@Parameter(description = "会话编号", required = true) @PathVariable Long sessionId) {
        Long userId = AppContextHolder.getUserId();
        authService.kickSession(sessionId, userId);
        return R.ok();
    }

    // ==================== Push Token ====================

    @Operation(summary = "更新推送令牌")
    @PutMapping("/push-token")
    public R<Void> updatePushToken(@Valid @RequestBody PushTokenUpdateDTO dto) {
        Long userId = AppContextHolder.getUserId();
        Platform platform = Platform.valueOf(AppContextHolder.getPlatform());
        authService.updatePushToken(userId, platform, dto.getPushToken(), dto.getPushChannel());
        return R.ok();
    }

    // ==================== OAuth Bindings ====================

    @Operation(summary = "查询 OAuth 绑定列表")
    @GetMapping("/oauth-bindings")
    public R<List<OauthBindingVO>> listOauthBindings() {
        Long userId = AppContextHolder.getUserId();
        return R.ok(authService.getUserOauthBindings(userId));
    }

    @Operation(summary = "解绑 OAuth 账号")
    @DeleteMapping("/oauth-bindings/{id}")
    public R<Void> deleteOauthBinding(@Parameter(description = "第三方绑定编号", required = true) @PathVariable Long id) {
        Long userId = AppContextHolder.getUserId();
        authService.deleteOauthBinding(id, userId);
        return R.ok();
    }
}
