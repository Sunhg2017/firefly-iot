package com.songhg.firefly.iot.system.controller;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.Platform;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresLogin;
import com.songhg.firefly.iot.system.dto.LoginRequest;
import com.songhg.firefly.iot.system.dto.LoginResponse;
import com.songhg.firefly.iot.system.dto.OauthAuthorizeUrlRequest;
import com.songhg.firefly.iot.system.dto.OauthAuthorizeUrlResponse;
import com.songhg.firefly.iot.system.dto.OauthLoginRequest;
import com.songhg.firefly.iot.system.dto.OauthProviderOptionVO;
import com.songhg.firefly.iot.system.dto.RefreshTokenRequest;
import com.songhg.firefly.iot.system.dto.SmsSendRequest;
import com.songhg.firefly.iot.system.service.AuthService;
import com.songhg.firefly.iot.system.service.JwtService;
import com.songhg.firefly.iot.system.service.OauthIntegrationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Tag(name = "认证管理", description = "登录、登出、短信验证、Token 刷新")
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final JwtService jwtService;
    private final OauthIntegrationService oauthIntegrationService;

    @Operation(summary = "用户登录", description = "支持密码登录和短信验证码登录")
    @PostMapping("/login")
    public R<LoginResponse> login(@Valid @RequestBody LoginRequest req, HttpServletRequest httpReq) {
        String ip = resolveClientIp(httpReq);
        String userAgent = resolveUserAgent(httpReq);

        return switch (req.getLoginMethod()) {
            case PASSWORD -> R.ok(authService.passwordLogin(req, ip, userAgent));
            case SMS -> R.ok(authService.smsLogin(req, ip, userAgent));
            default -> R.fail(1000, "不支持的登录方式: " + req.getLoginMethod());
        };
    }

    @Operation(summary = "发送短信验证码")
    @PostMapping("/sms/send")
    public R<Void> sendSmsCode(@Valid @RequestBody SmsSendRequest req, HttpServletRequest httpReq) {
        String purpose = req.getPurpose() != null ? req.getPurpose() : "LOGIN";
        authService.sendSmsCode(req.getPhone(), purpose, resolveClientIp(httpReq));
        return R.ok();
    }

    @Operation(summary = "查询可用第三方登录提供商")
    @GetMapping("/oauth/providers")
    public R<List<OauthProviderOptionVO>> listOauthProviders() {
        return R.ok(oauthIntegrationService.listProviderOptions());
    }

    @Operation(summary = "生成第三方登录授权地址")
    @PostMapping("/oauth/authorize-url")
    public R<OauthAuthorizeUrlResponse> buildOauthAuthorizeUrl(@Valid @RequestBody OauthAuthorizeUrlRequest req) {
        return R.ok(oauthIntegrationService.buildAuthorizeUrl(req, null));
    }

    @Operation(summary = "微信登录")
    @PostMapping("/wechat")
    public R<LoginResponse> wechatLogin(@Valid @RequestBody OauthLoginRequest req, HttpServletRequest httpReq) {
        return R.ok(oauthIntegrationService.loginWithWechat(req, resolveClientIp(httpReq), resolveUserAgent(httpReq)));
    }

    @Operation(summary = "微信小程序登录")
    @PostMapping("/wechat-mini")
    public R<LoginResponse> wechatMiniLogin(@Valid @RequestBody OauthLoginRequest req, HttpServletRequest httpReq) {
        return R.ok(oauthIntegrationService.loginWithWechatMini(req, resolveClientIp(httpReq), resolveUserAgent(httpReq)));
    }

    @Operation(summary = "支付宝登录")
    @PostMapping("/alipay")
    public R<LoginResponse> alipayLogin(@Valid @RequestBody OauthLoginRequest req, HttpServletRequest httpReq) {
        return R.ok(oauthIntegrationService.loginWithAlipay(req, resolveClientIp(httpReq), resolveUserAgent(httpReq)));
    }

    @Operation(summary = "Apple 登录")
    @PostMapping("/apple")
    public R<LoginResponse> appleLogin(@Valid @RequestBody OauthLoginRequest req, HttpServletRequest httpReq) {
        return R.ok(oauthIntegrationService.loginWithApple(req, resolveClientIp(httpReq), resolveUserAgent(httpReq)));
    }

    @Operation(summary = "钉钉登录")
    @PostMapping("/dingtalk")
    public R<LoginResponse> dingTalkLogin(@Valid @RequestBody OauthLoginRequest req, HttpServletRequest httpReq) {
        return R.ok(oauthIntegrationService.loginWithDingTalk(req, resolveClientIp(httpReq), resolveUserAgent(httpReq)));
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
        Long userId = AppContextHolder.getUserId();
        Platform platform = Platform.valueOf(AppContextHolder.getPlatform());
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
        Long userId = AppContextHolder.getUserId();
        authService.logoutAll(userId);
        return R.ok();
    }

    @Operation(summary = "获取 JWK 公钥信息")
    @GetMapping("/.well-known/jwks.json")
    public R<Map<String, Object>> jwks() {
        return R.ok(jwtService.getPublicKeyInfo());
    }

    private String resolveClientIp(HttpServletRequest request) {
        String forwarded = trimHeader(request, "X-Forwarded-For");
        if (StringUtils.hasText(forwarded)) {
            int commaIndex = forwarded.indexOf(',');
            return commaIndex > 0 ? forwarded.substring(0, commaIndex).trim() : forwarded;
        }
        String realIp = trimHeader(request, "X-Real-IP");
        if (StringUtils.hasText(realIp)) {
            return realIp;
        }
        return request.getRemoteAddr();
    }

    private String resolveUserAgent(HttpServletRequest request) {
        String userAgent = trimHeader(request, "User-Agent");
        if (StringUtils.hasText(userAgent)) {
            return userAgent;
        }

        List<String> clientHints = new ArrayList<>();
        appendClientHint(clientHints, "Sec-CH-UA", trimHeader(request, "Sec-CH-UA"));
        appendClientHint(clientHints, "Sec-CH-UA-Platform", trimHeader(request, "Sec-CH-UA-Platform"));
        appendClientHint(clientHints, "Sec-CH-UA-Mobile", trimHeader(request, "Sec-CH-UA-Mobile"));
        appendClientHint(clientHints, "Sec-CH-UA-Platform-Version", trimHeader(request, "Sec-CH-UA-Platform-Version"));

        return clientHints.isEmpty() ? null : String.join("; ", clientHints);
    }

    private void appendClientHint(List<String> clientHints, String name, String value) {
        if (StringUtils.hasText(value)) {
            clientHints.add(name + "=" + value);
        }
    }

    private String trimHeader(HttpServletRequest request, String headerName) {
        String value = request.getHeader(headerName);
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }
}
