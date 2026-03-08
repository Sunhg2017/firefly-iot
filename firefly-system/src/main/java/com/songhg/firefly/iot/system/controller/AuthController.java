package com.songhg.firefly.iot.system.controller;

import com.songhg.firefly.iot.system.dto.LoginRequest;
import com.songhg.firefly.iot.system.dto.LoginResponse;
import com.songhg.firefly.iot.system.dto.RefreshTokenRequest;
import com.songhg.firefly.iot.system.dto.SmsSendRequest;
import com.songhg.firefly.iot.system.service.AuthService;
import com.songhg.firefly.iot.system.service.JwtService;
import com.songhg.firefly.iot.common.context.UserContextHolder;
import com.songhg.firefly.iot.common.enums.Platform;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresLogin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Tag(name = "认证管理", description = "登录、登出、短信验证、Token 刷新")
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final JwtService jwtService;

    @Operation(summary = "用户登录", description = "支持密码登录和短信验证码登录")
    @PostMapping("/login")
    public R<LoginResponse> login(@Valid @RequestBody LoginRequest req, HttpServletRequest httpReq) {
        String ip = httpReq.getRemoteAddr();
        String ua = httpReq.getHeader("User-Agent");

        return switch (req.getLoginMethod()) {
            case PASSWORD -> R.ok(authService.passwordLogin(req, ip, ua));
            case SMS -> R.ok(authService.smsLogin(req, ip, ua));
            default -> R.fail(1000, "不支持的登录方式: " + req.getLoginMethod());
        };
    }

    @Operation(summary = "发送短信验证码")
    @PostMapping("/sms/send")
    public R<Void> sendSmsCode(@Valid @RequestBody SmsSendRequest req, HttpServletRequest httpReq) {
        String purpose = req.getPurpose() != null ? req.getPurpose() : "LOGIN";
        authService.sendSmsCode(req.getPhone(), purpose, httpReq.getRemoteAddr());
        return R.ok();
    }

    @Operation(summary = "刷新访问令牌")
    @PostMapping("/refresh")
    public R<LoginResponse> refreshToken(@Valid @RequestBody RefreshTokenRequest req) {
        return R.ok(authService.refreshToken(req.getRefreshToken()));
    }

    @Operation(summary = "登出当前会话")
    @RequiresLogin
    @PostMapping("/logout")
    public R<Void> logout(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        Long userId = UserContextHolder.getUserId();
        Platform platform = Platform.valueOf(UserContextHolder.get().getPlatform());
        String accessToken = null;
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            accessToken = authHeader.substring(7);
        }
        authService.logout(userId, platform, accessToken);
        return R.ok();
    }

    @Operation(summary = "登出所有会话")
    @RequiresLogin
    @PostMapping("/logout-all")
    public R<Void> logoutAll() {
        Long userId = UserContextHolder.getUserId();
        authService.logoutAll(userId);
        return R.ok();
    }

    @Operation(summary = "获取 JWK 公钥信息")
    @GetMapping("/.well-known/jwks.json")
    public R<Map<String, Object>> jwks() {
        return R.ok(jwtService.getPublicKeyInfo());
    }
}
