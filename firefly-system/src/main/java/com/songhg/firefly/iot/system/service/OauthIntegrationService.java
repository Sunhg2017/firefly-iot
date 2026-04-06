package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.constant.AuthConstants;
import com.songhg.firefly.iot.common.enums.LoginMethod;
import com.songhg.firefly.iot.common.enums.OauthProvider;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.system.dto.LoginResponse;
import com.songhg.firefly.iot.system.dto.OauthAuthorizeUrlRequest;
import com.songhg.firefly.iot.system.dto.OauthAuthorizeUrlResponse;
import com.songhg.firefly.iot.system.dto.OauthBindRequest;
import com.songhg.firefly.iot.system.dto.OauthBindingVO;
import com.songhg.firefly.iot.system.dto.OauthLoginRequest;
import com.songhg.firefly.iot.system.dto.OauthProviderOptionVO;
import com.songhg.firefly.iot.system.entity.User;
import com.songhg.firefly.iot.system.entity.UserOauthBinding;
import com.songhg.firefly.iot.system.mapper.UserMapper;
import com.songhg.firefly.iot.system.mapper.UserOauthBindingMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigInteger;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * 第三方登录接入统一收口在这里，控制器只负责路由，外部平台差异和绑定逻辑集中处理。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OauthIntegrationService {

    private static final DateTimeFormatter ALIPAY_TIMESTAMP_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String OAUTH_ACTION_LOGIN = "LOGIN";
    private static final String OAUTH_ACTION_BIND = "BIND";
    private static final String ALIPAY_GATEWAY_DEFAULT = "https://openapi.alipay.com/gateway.do";

    private final AuthService authService;
    private final SystemConfigService systemConfigService;
    private final UserMapper userMapper;
    private final UserOauthBindingMapper oauthBindingMapper;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @Qualifier("thirdPartyAuthRestTemplate")
    private final RestTemplate thirdPartyAuthRestTemplate;

    public List<OauthProviderOptionVO> listProviderOptions() {
        return List.of(
                buildProviderOption(
                        OauthProvider.WECHAT,
                        "微信",
                        isWechatWebEnabled() || isWechatMiniEnabled(),
                        isWechatWebEnabled(),
                        isWechatWebEnabled(),
                        isWechatWebEnabled() || isWechatMiniEnabled(),
                        "支持 Web 扫码、APP 微信授权和微信小程序授权"),
                buildProviderOption(
                        OauthProvider.DINGTALK,
                        "钉钉",
                        isDingTalkEnabled(),
                        isDingTalkEnabled(),
                        isDingTalkEnabled(),
                        isDingTalkEnabled(),
                        "支持 Web 扫码和客户端钉钉授权"),
                buildProviderOption(
                        OauthProvider.ALIPAY,
                        "支付宝",
                        isAlipayEnabled(),
                        false,
                        false,
                        isAlipayEnabled(),
                        "通过客户端授权后调用接口完成登录或绑定"),
                buildProviderOption(
                        OauthProvider.APPLE,
                        "Apple",
                        isAppleEnabled(),
                        false,
                        false,
                        isAppleEnabled(),
                        "通过 iOS Sign in with Apple 获取 identityToken 后调用接口完成登录或绑定")
        );
    }

    public OauthAuthorizeUrlResponse buildAuthorizeUrl(OauthAuthorizeUrlRequest request, Long currentUserId) {
        OauthProvider provider = request.getProvider();
        String action = normalizeAction(request.getAction());
        String redirectUri = normalizeRedirectUri(request.getRedirectUri());
        String state = createOauthState(provider, action, currentUserId);

        String authorizeUrl = switch (provider) {
            case WECHAT -> buildWechatAuthorizeUrl(redirectUri, state);
            case DINGTALK -> buildDingTalkAuthorizeUrl(redirectUri, state);
            case ALIPAY, APPLE -> throw new BizException(ResultCode.PARAM_ERROR, "当前提供商不支持 Web 授权跳转");
        };

        OauthAuthorizeUrlResponse response = new OauthAuthorizeUrlResponse();
        response.setProvider(provider.getValue());
        response.setAction(action);
        response.setAuthorizeUrl(authorizeUrl);
        return response;
    }

    public LoginResponse loginWithWechat(OauthLoginRequest request, String remoteIp, String userAgent) {
        validateOauthPlatform(request);
        if (request.getPlatform() == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "platform is required");
        }
        if (request.getPlatform().getValue().equals(AuthConstants.PLATFORM_MINI_WECHAT)) {
            return loginWithAuthenticatedProfile(authenticateWechatMini(request), request, remoteIp, userAgent);
        }
        return loginWithAuthenticatedProfile(authenticateWechatWeb(request), request, remoteIp, userAgent);
    }

    public LoginResponse loginWithWechatMini(OauthLoginRequest request, String remoteIp, String userAgent) {
        validateOauthPlatform(request);
        return loginWithAuthenticatedProfile(authenticateWechatMini(request), request, remoteIp, userAgent);
    }

    public LoginResponse loginWithAlipay(OauthLoginRequest request, String remoteIp, String userAgent) {
        validateOauthPlatform(request);
        return loginWithAuthenticatedProfile(authenticateAlipay(request), request, remoteIp, userAgent);
    }

    public LoginResponse loginWithApple(OauthLoginRequest request, String remoteIp, String userAgent) {
        validateOauthPlatform(request);
        return loginWithAuthenticatedProfile(authenticateApple(request), request, remoteIp, userAgent);
    }

    public LoginResponse loginWithDingTalk(OauthLoginRequest request, String remoteIp, String userAgent) {
        validateOauthPlatform(request);
        return loginWithAuthenticatedProfile(authenticateDingTalk(request), request, remoteIp, userAgent);
    }

    public OauthBindingVO bindCurrentUser(Long userId, OauthBindRequest request) {
        if (userId == null || userId <= 0) {
            throw new BizException(ResultCode.UNAUTHORIZED);
        }
        User currentUser = requireUser(userId);
        OauthAuthenticatedProfile profile = authenticateForBinding(request, userId);
        UserOauthBinding binding = createOrUpdateBinding(currentUser, profile);
        return toBindingVo(binding);
    }

    private LoginResponse loginWithAuthenticatedProfile(OauthAuthenticatedProfile profile,
                                                        OauthLoginRequest request,
                                                        String remoteIp,
                                                        String userAgent) {
        User user = resolveUserForOauthLogin(profile);
        return authService.oauthLogin(user, profile.getLoginMethod(), request.getPlatform(), request.getFingerprint(), remoteIp, userAgent);
    }

    private OauthAuthenticatedProfile authenticateForBinding(OauthBindRequest request, Long userId) {
        return switch (request.getProvider()) {
            case WECHAT -> authenticateWechatForBinding(request, userId);
            case DINGTALK -> authenticateDingTalkForBinding(request, userId);
            case ALIPAY -> authenticateAlipayForBinding(request);
            case APPLE -> authenticateAppleForBinding(request);
        };
    }

    private OauthAuthenticatedProfile authenticateWechatForBinding(OauthBindRequest request, Long userId) {
        if (StringUtils.hasText(request.getState())) {
            validateOauthState(request.getProvider(), OAUTH_ACTION_BIND, request.getState(), userId);
        }
        OauthLoginRequest loginRequest = new OauthLoginRequest();
        loginRequest.setCode(request.getCode());
        loginRequest.setState(request.getState());
        loginRequest.setPlatform(com.songhg.firefly.iot.common.enums.Platform.WEB);
        loginRequest.setEncryptedData(request.getEncryptedData());
        loginRequest.setIv(request.getIv());
        return authenticateWechatWeb(loginRequest);
    }

    private OauthAuthenticatedProfile authenticateDingTalkForBinding(OauthBindRequest request, Long userId) {
        if (StringUtils.hasText(request.getState())) {
            validateOauthState(request.getProvider(), OAUTH_ACTION_BIND, request.getState(), userId);
        }
        OauthLoginRequest loginRequest = new OauthLoginRequest();
        loginRequest.setCode(request.getCode());
        loginRequest.setState(request.getState());
        loginRequest.setPlatform(com.songhg.firefly.iot.common.enums.Platform.WEB);
        return authenticateDingTalk(loginRequest);
    }

    private OauthAuthenticatedProfile authenticateAlipayForBinding(OauthBindRequest request) {
        OauthLoginRequest loginRequest = new OauthLoginRequest();
        loginRequest.setAuthCode(request.getAuthCode());
        loginRequest.setCode(request.getCode());
        loginRequest.setPlatform(com.songhg.firefly.iot.common.enums.Platform.MINI_ALIPAY);
        return authenticateAlipay(loginRequest);
    }

    private OauthAuthenticatedProfile authenticateAppleForBinding(OauthBindRequest request) {
        OauthLoginRequest loginRequest = new OauthLoginRequest();
        loginRequest.setIdentityToken(request.getIdentityToken());
        loginRequest.setAuthorizationCode(request.getAuthorizationCode());
        loginRequest.setPlatform(com.songhg.firefly.iot.common.enums.Platform.APP_IOS);
        return authenticateApple(loginRequest);
    }

    private OauthAuthenticatedProfile authenticateWechatWeb(OauthLoginRequest request) {
        WechatWebConfig config = loadWechatWebConfig(true);
        requireText(request.getCode(), "微信授权 code 不能为空");
        if (StringUtils.hasText(request.getState())) {
            validateOauthState(OauthProvider.WECHAT, OAUTH_ACTION_LOGIN, request.getState(), null);
        }

        JsonNode tokenResponse = getJson(URI.create(UriComponentsBuilder
                .fromHttpUrl("https://api.weixin.qq.com/sns/oauth2/access_token")
                .queryParam("appid", config.appId())
                .queryParam("secret", config.appSecret())
                .queryParam("code", request.getCode().trim())
                .queryParam("grant_type", "authorization_code")
                .build(true)
                .toUriString()));
        checkWechatError(tokenResponse, "微信授权失败");

        String accessToken = text(tokenResponse, "access_token");
        String openId = firstNonBlank(text(tokenResponse, "openid"), text(tokenResponse, "openId"));
        String unionId = firstNonBlank(text(tokenResponse, "unionid"), text(tokenResponse, "unionId"));
        JsonNode userInfoResponse = null;
        if (StringUtils.hasText(accessToken) && StringUtils.hasText(openId)) {
            userInfoResponse = getJson(URI.create(UriComponentsBuilder
                    .fromHttpUrl("https://api.weixin.qq.com/sns/userinfo")
                    .queryParam("access_token", accessToken)
                    .queryParam("openid", openId)
                    .build(true)
                    .toUriString()));
            if (hasWechatError(userInfoResponse)) {
                log.warn("WeChat user info lookup failed: response={}", safeToJson(userInfoResponse));
                userInfoResponse = null;
            }
        }

        OauthAuthenticatedProfile profile = new OauthAuthenticatedProfile();
        profile.setProvider(OauthProvider.WECHAT);
        profile.setLoginMethod(LoginMethod.WECHAT);
        profile.setAppId(config.appId());
        profile.setOpenId(openId);
        profile.setUnionId(firstNonBlank(unionId, text(userInfoResponse, "unionid"), text(userInfoResponse, "unionId")));
        profile.setNickname(firstNonBlank(text(userInfoResponse, "nickname"), text(tokenResponse, "nickname")));
        profile.setAvatarUrl(firstNonBlank(text(userInfoResponse, "headimgurl"), text(userInfoResponse, "avatar")));
        profile.setRawData(mergeRawData(tokenResponse, userInfoResponse));
        ensureProfileHasPrincipal(profile, "微信授权未返回可识别账号标识");
        return profile;
    }

    private OauthAuthenticatedProfile authenticateWechatMini(OauthLoginRequest request) {
        WechatMiniConfig config = loadWechatMiniConfig(true);
        requireText(request.getCode(), "微信小程序 code 不能为空");

        JsonNode sessionResponse = getJson(URI.create(UriComponentsBuilder
                .fromHttpUrl("https://api.weixin.qq.com/sns/jscode2session")
                .queryParam("appid", config.appId())
                .queryParam("secret", config.appSecret())
                .queryParam("js_code", request.getCode().trim())
                .queryParam("grant_type", "authorization_code")
                .build(true)
                .toUriString()));
        checkWechatError(sessionResponse, "微信小程序授权失败");

        String sessionKey = text(sessionResponse, "session_key");
        JsonNode decryptedUserInfo = null;
        if (StringUtils.hasText(sessionKey) && StringUtils.hasText(request.getEncryptedData()) && StringUtils.hasText(request.getIv())) {
            decryptedUserInfo = decryptWechatMiniUserInfo(sessionKey, request.getEncryptedData(), request.getIv());
        }

        OauthAuthenticatedProfile profile = new OauthAuthenticatedProfile();
        profile.setProvider(OauthProvider.WECHAT);
        profile.setLoginMethod(LoginMethod.WECHAT_MINI);
        profile.setAppId(config.appId());
        profile.setOpenId(firstNonBlank(text(sessionResponse, "openid"), text(decryptedUserInfo, "openId")));
        profile.setUnionId(firstNonBlank(text(decryptedUserInfo, "unionId"), text(sessionResponse, "unionid")));
        profile.setNickname(firstNonBlank(text(decryptedUserInfo, "nickName"), text(decryptedUserInfo, "nickname")));
        profile.setAvatarUrl(firstNonBlank(text(decryptedUserInfo, "avatarUrl"), text(decryptedUserInfo, "avatar")));
        profile.setPhone(firstNonBlank(text(decryptedUserInfo, "purePhoneNumber"), text(decryptedUserInfo, "phoneNumber")));
        profile.setRawData(mergeRawData(sessionResponse, decryptedUserInfo));
        ensureProfileHasPrincipal(profile, "微信小程序授权未返回可识别账号标识");
        return profile;
    }

    private OauthAuthenticatedProfile authenticateDingTalk(OauthLoginRequest request) {
        DingTalkConfig config = loadDingTalkConfig(true);
        requireText(request.getCode(), "钉钉授权 code 不能为空");
        if (StringUtils.hasText(request.getState())) {
            validateOauthState(OauthProvider.DINGTALK, OAUTH_ACTION_LOGIN, request.getState(), null);
        }

        JsonNode tokenResponse = postJson(
                URI.create("https://api.dingtalk.com/v1.0/oauth2/userAccessToken"),
                Map.of(
                        "clientId", config.clientId(),
                        "clientSecret", config.clientSecret(),
                        "code", request.getCode().trim(),
                        "grantType", "authorization_code"),
                null);
        checkProviderError(tokenResponse, "钉钉授权失败");

        String accessToken = firstNonBlank(text(tokenResponse, "accessToken"), text(tokenResponse, "access_token"));
        JsonNode userInfoResponse = getJson(
                URI.create("https://api.dingtalk.com/v1.0/contact/users/me"),
                headers -> headers.set("x-acs-dingtalk-access-token", accessToken));
        checkProviderError(userInfoResponse, "钉钉用户信息查询失败");

        OauthAuthenticatedProfile profile = new OauthAuthenticatedProfile();
        profile.setProvider(OauthProvider.DINGTALK);
        profile.setLoginMethod(LoginMethod.DINGTALK);
        profile.setAppId(config.clientId());
        profile.setOpenId(firstNonBlank(text(userInfoResponse, "openid"), text(userInfoResponse, "openId"), text(userInfoResponse, "unionId")));
        profile.setUnionId(text(userInfoResponse, "unionId"));
        profile.setNickname(firstNonBlank(text(userInfoResponse, "nick"), text(userInfoResponse, "name")));
        profile.setAvatarUrl(firstNonBlank(text(userInfoResponse, "avatarUrl"), text(userInfoResponse, "avatar")));
        profile.setEmail(text(userInfoResponse, "email"));
        profile.setPhone(firstNonBlank(text(userInfoResponse, "mobile"), text(userInfoResponse, "mobileNumber")));
        profile.setRawData(mergeRawData(tokenResponse, userInfoResponse));
        ensureProfileHasPrincipal(profile, "钉钉授权未返回可识别账号标识");
        return profile;
    }

    private OauthAuthenticatedProfile authenticateAlipay(OauthLoginRequest request) {
        AlipayConfig config = loadAlipayConfig(true);
        String authCode = firstNonBlank(request.getAuthCode(), request.getCode());
        requireText(authCode, "支付宝 authCode 不能为空");

        JsonNode tokenResponse = callAlipayGateway(config, "alipay.system.oauth.token", Map.of(
                "grant_type", "authorization_code",
                "code", authCode.trim()));
        JsonNode userInfoResponse = callAlipayGateway(config, "alipay.user.info.share", Map.of(
                "auth_token", firstNonBlank(text(tokenResponse, "access_token"), text(tokenResponse, "accessToken"))));

        OauthAuthenticatedProfile profile = new OauthAuthenticatedProfile();
        profile.setProvider(OauthProvider.ALIPAY);
        profile.setLoginMethod(LoginMethod.ALIPAY);
        profile.setAppId(config.appId());
        profile.setOpenId(firstNonBlank(
                text(userInfoResponse, "open_id"),
                text(tokenResponse, "open_id"),
                text(userInfoResponse, "user_id"),
                text(tokenResponse, "user_id")));
        profile.setNickname(firstNonBlank(text(userInfoResponse, "nick_name"), text(userInfoResponse, "user_name")));
        profile.setAvatarUrl(firstNonBlank(text(userInfoResponse, "avatar"), text(userInfoResponse, "avatar_url")));
        profile.setEmail(text(userInfoResponse, "email"));
        profile.setPhone(firstNonBlank(text(userInfoResponse, "mobile"), text(userInfoResponse, "mobile_number")));
        profile.setRawData(mergeRawData(tokenResponse, userInfoResponse));
        ensureProfileHasPrincipal(profile, "支付宝授权未返回可识别账号标识");
        return profile;
    }

    private OauthAuthenticatedProfile authenticateApple(OauthLoginRequest request) {
        AppleConfig config = loadAppleConfig(true);
        requireText(request.getIdentityToken(), "Apple identityToken 不能为空");

        Claims claims = verifyAppleIdentityToken(request.getIdentityToken().trim(), config.clientId());

        OauthAuthenticatedProfile profile = new OauthAuthenticatedProfile();
        profile.setProvider(OauthProvider.APPLE);
        profile.setLoginMethod(LoginMethod.APPLE);
        profile.setAppId(config.clientId());
        profile.setOpenId(claims.getSubject());
        profile.setEmail(claims.get("email", String.class));
        profile.setRawData(request.getIdentityToken().trim());
        ensureProfileHasPrincipal(profile, "Apple 授权未返回可识别账号标识");
        return profile;
    }

    private User resolveUserForOauthLogin(OauthAuthenticatedProfile profile) {
        UserOauthBinding exactBinding = findExactBinding(profile);
        if (exactBinding != null) {
            User user = requireUser(exactBinding.getUserId());
            createOrUpdateBinding(user, profile);
            return user;
        }

        UserOauthBinding unionBinding = findUnionBinding(profile);
        if (unionBinding != null) {
            User user = requireUser(unionBinding.getUserId());
            createOrUpdateBinding(user, profile);
            return user;
        }

        User matchedUser = matchUserByVerifiedIdentifier(profile);
        if (matchedUser != null) {
            createOrUpdateBinding(matchedUser, profile);
            return matchedUser;
        }

        // 当前登录请求里没有租户选择参数，无法安全地把全新第三方账号直接落到某个租户，
        // 因此这里只允许“已绑定账号直登”或“唯一邮箱/手机号映射到现有用户后自动补绑定”。
        throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "第三方账号未绑定，请先使用账号密码或短信登录后再绑定");
    }

    private User matchUserByVerifiedIdentifier(OauthAuthenticatedProfile profile) {
        String identifier = firstNonBlank(profile.getEmail(), profile.getPhone());
        if (!StringUtils.hasText(identifier)) {
            return null;
        }
        List<User> users = userMapper.findByIdentifierGlobal(identifier.trim());
        if (users == null || users.isEmpty()) {
            return null;
        }
        if (users.size() > 1) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "第三方账号映射到多个本地账号，请先完成人工绑定");
        }
        return users.getFirst();
    }

    private UserOauthBinding createOrUpdateBinding(User user, OauthAuthenticatedProfile profile) {
        UserOauthBinding exactBinding = findExactBinding(profile);
        if (exactBinding != null && !exactBinding.getUserId().equals(user.getId())) {
            throw new BizException(ResultCode.CONFLICT, "第三方账号已绑定到其他用户");
        }

        UserOauthBinding unionBinding = findUnionBinding(profile);
        if (unionBinding != null && !unionBinding.getUserId().equals(user.getId())) {
            throw new BizException(ResultCode.CONFLICT, "同一第三方账号主体已绑定到其他用户");
        }

        UserOauthBinding target = exactBinding;
        if (target == null) {
            target = new UserOauthBinding();
            target.setUserId(user.getId());
            target.setTenantId(user.getTenantId());
            target.setProvider(profile.getProvider());
            target.setCreatedAt(LocalDateTime.now());
        }

        target.setAppId(profile.getAppId());
        target.setOpenId(profile.getOpenId());
        target.setUnionId(profile.getUnionId());
        target.setNickname(profile.getNickname());
        target.setAvatarUrl(profile.getAvatarUrl());
        target.setRawData(profile.getRawData());
        target.setUpdatedAt(LocalDateTime.now());

        if (target.getId() == null) {
            oauthBindingMapper.insert(target);
        } else {
            oauthBindingMapper.updateById(target);
        }
        return target;
    }

    private UserOauthBinding findExactBinding(OauthAuthenticatedProfile profile) {
        if (!StringUtils.hasText(profile.getOpenId()) || !StringUtils.hasText(profile.getAppId())) {
            return null;
        }
        return oauthBindingMapper.selectOne(new LambdaQueryWrapper<UserOauthBinding>()
                .eq(UserOauthBinding::getProvider, profile.getProvider())
                .eq(UserOauthBinding::getOpenId, profile.getOpenId())
                .eq(UserOauthBinding::getAppId, profile.getAppId())
                .last("LIMIT 1"));
    }

    private UserOauthBinding findUnionBinding(OauthAuthenticatedProfile profile) {
        if (!StringUtils.hasText(profile.getUnionId())) {
            return null;
        }
        return oauthBindingMapper.selectOne(new LambdaQueryWrapper<UserOauthBinding>()
                .eq(UserOauthBinding::getProvider, profile.getProvider())
                .eq(UserOauthBinding::getUnionId, profile.getUnionId())
                .last("LIMIT 1"));
    }

    private User requireUser(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null || user.getDeletedAt() != null) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "关联用户不存在或已删除");
        }
        return user;
    }

    private OauthBindingVO toBindingVo(UserOauthBinding binding) {
        OauthBindingVO response = new OauthBindingVO();
        response.setId(binding.getId());
        response.setProvider(binding.getProvider());
        response.setNickname(binding.getNickname());
        response.setAvatarUrl(binding.getAvatarUrl());
        response.setCreatedAt(binding.getCreatedAt());
        return response;
    }

    private OauthProviderOptionVO buildProviderOption(OauthProvider provider,
                                                      String displayName,
                                                      boolean enabled,
                                                      boolean webAuthorizeSupported,
                                                      boolean webBindSupported,
                                                      boolean apiLoginSupported,
                                                      String usageHint) {
        OauthProviderOptionVO option = new OauthProviderOptionVO();
        option.setProvider(provider);
        option.setDisplayName(displayName);
        option.setEnabled(enabled);
        option.setWebAuthorizeSupported(webAuthorizeSupported);
        option.setWebBindSupported(webBindSupported);
        option.setApiLoginSupported(apiLoginSupported);
        option.setUsageHint(usageHint);
        return option;
    }

    private void validateOauthPlatform(OauthLoginRequest request) {
        if (request == null || request.getPlatform() == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "platform is required");
        }
    }

    private String buildWechatAuthorizeUrl(String redirectUri, String state) {
        WechatWebConfig config = loadWechatWebConfig(true);
        return UriComponentsBuilder.fromHttpUrl("https://open.weixin.qq.com/connect/qrconnect")
                .queryParam("appid", config.appId())
                .queryParam("redirect_uri", redirectUri)
                .queryParam("response_type", "code")
                .queryParam("scope", "snsapi_login")
                .queryParam("state", state)
                .build()
                .toUriString() + "#wechat_redirect";
    }

    private String buildDingTalkAuthorizeUrl(String redirectUri, String state) {
        DingTalkConfig config = loadDingTalkConfig(true);
        return UriComponentsBuilder.fromHttpUrl("https://login.dingtalk.com/oauth2/auth")
                .queryParam("redirect_uri", redirectUri)
                .queryParam("response_type", "code")
                .queryParam("client_id", config.clientId())
                .queryParam("scope", "openid")
                .queryParam("state", state)
                .queryParam("prompt", "consent")
                .build()
                .toUriString();
    }

    private String createOauthState(OauthProvider provider, String action, Long userId) {
        String state = UUID.randomUUID().toString().replace("-", "");
        String payload = provider.getValue() + "|" + action + "|" + (userId == null ? "0" : userId);
        redisTemplate.opsForValue().set(
                AuthConstants.REDIS_OAUTH_STATE + state,
                payload,
                AuthConstants.OAUTH_STATE_EXPIRE_SECONDS,
                TimeUnit.SECONDS);
        return state;
    }

    private void validateOauthState(OauthProvider provider, String action, String state, Long expectedUserId) {
        if (!StringUtils.hasText(state)) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "第三方授权 state 缺失");
        }
        // state 在服务端按一次性票据消费，避免同一授权结果被重复兑换。
        String payload = redisTemplate.opsForValue().getAndDelete(AuthConstants.REDIS_OAUTH_STATE + state.trim());
        if (!StringUtils.hasText(payload)) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "第三方授权 state 无效或已过期");
        }

        String[] parts = payload.split("\\|", -1);
        if (parts.length != 3) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "第三方授权 state 数据异常");
        }
        if (!provider.getValue().equals(parts[0]) || !action.equals(parts[1])) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "第三方授权 state 不匹配");
        }

        long storedUserId = Long.parseLong(parts[2]);
        long targetUserId = expectedUserId == null ? 0L : expectedUserId;
        if (storedUserId != targetUserId) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "第三方授权 state 与当前操作用户不匹配");
        }
    }

    private String normalizeAction(String action) {
        if (!StringUtils.hasText(action)) {
            throw new BizException(ResultCode.PARAM_ERROR, "action is required");
        }
        String normalized = action.trim().toUpperCase();
        if (!OAUTH_ACTION_LOGIN.equals(normalized) && !OAUTH_ACTION_BIND.equals(normalized)) {
            throw new BizException(ResultCode.PARAM_ERROR, "unsupported oauth action: " + action);
        }
        return normalized;
    }

    private String normalizeRedirectUri(String redirectUri) {
        if (!StringUtils.hasText(redirectUri)) {
            throw new BizException(ResultCode.PARAM_ERROR, "redirectUri is required");
        }
        String normalized = redirectUri.trim();
        URI uri = URI.create(normalized);
        if (!StringUtils.hasText(uri.getScheme()) || !StringUtils.hasText(uri.getHost())) {
            throw new BizException(ResultCode.PARAM_ERROR, "redirectUri must be absolute");
        }
        return normalized;
    }

    private JsonNode getJson(URI uri) {
        return getJson(uri, null);
    }

    private JsonNode getJson(URI uri, java.util.function.Consumer<HttpHeaders> headerCustomizer) {
        try {
            HttpHeaders headers = new HttpHeaders();
            if (headerCustomizer != null) {
                headerCustomizer.accept(headers);
            }
            ResponseEntity<String> response = thirdPartyAuthRestTemplate.exchange(
                    uri,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    String.class);
            return parseJson(response.getBody());
        } catch (RestClientException ex) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "调用第三方平台失败: " + ex.getMessage());
        }
    }

    private JsonNode postJson(URI uri, Object body, java.util.function.Consumer<HttpHeaders> headerCustomizer) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            if (headerCustomizer != null) {
                headerCustomizer.accept(headers);
            }
            ResponseEntity<String> response = thirdPartyAuthRestTemplate.exchange(
                    uri,
                    HttpMethod.POST,
                    new HttpEntity<>(body, headers),
                    String.class);
            return parseJson(response.getBody());
        } catch (RestClientException ex) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "调用第三方平台失败: " + ex.getMessage());
        }
    }

    private JsonNode postForm(URI uri, MultiValueMap<String, String> formData) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            ResponseEntity<String> response = thirdPartyAuthRestTemplate.exchange(
                    uri,
                    HttpMethod.POST,
                    new HttpEntity<>(formData, headers),
                    String.class);
            return parseJson(response.getBody());
        } catch (RestClientException ex) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "调用第三方平台失败: " + ex.getMessage());
        }
    }

    private JsonNode callAlipayGateway(AlipayConfig config, String method, Map<String, String> businessParams) {
        // 支付宝网关签名按所有请求参数字典序拼接，因此这里显式使用 TreeMap 保证顺序稳定。
        Map<String, String> sortedParams = new TreeMap<>();
        sortedParams.put("app_id", config.appId());
        sortedParams.put("charset", "utf-8");
        sortedParams.put("method", method);
        sortedParams.put("sign_type", "RSA2");
        sortedParams.put("timestamp", ALIPAY_TIMESTAMP_FORMATTER.format(LocalDateTime.now()));
        sortedParams.put("version", "1.0");
        if (businessParams != null) {
            sortedParams.putAll(businessParams);
        }

        String sign = signAlipayPayload(sortedParams, config.privateKeyPem());
        MultiValueMap<String, String> formData = new LinkedMultiValueMap<>();
        sortedParams.forEach(formData::add);
        formData.add("sign", sign);

        JsonNode root = postForm(URI.create(firstNonBlank(config.gateway(), ALIPAY_GATEWAY_DEFAULT)), formData);
        JsonNode error = root.path("error_response");
        if (!error.isMissingNode() && !error.isNull()) {
            String errorMessage = firstNonBlank(text(error, "sub_msg"), text(error, "msg"), "支付宝接口调用失败");
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, errorMessage);
        }

        String responseKey = method.replace('.', '_') + "_response";
        JsonNode responseNode = root.path(responseKey);
        if (responseNode.isMissingNode() || responseNode.isNull()) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "支付宝接口响应缺少业务结果");
        }
        return responseNode;
    }

    private String signAlipayPayload(Map<String, String> payload, String privateKeyPem) {
        try {
            String content = payload.entrySet().stream()
                    .filter(entry -> StringUtils.hasText(entry.getValue()))
                    .map(entry -> entry.getKey() + "=" + entry.getValue())
                    .reduce((left, right) -> left + "&" + right)
                    .orElse("");
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initSign(loadPrivateKey(privateKeyPem));
            signature.update(content.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(signature.sign());
        } catch (Exception ex) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "支付宝签名生成失败: " + ex.getMessage());
        }
    }

    private PrivateKey loadPrivateKey(String privateKeyPem) {
        try {
            byte[] decoded = Base64.getDecoder().decode(normalizePem(privateKeyPem));
            return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(decoded));
        } catch (Exception ex) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "支付宝私钥格式无效: " + ex.getMessage());
        }
    }

    private Claims verifyAppleIdentityToken(String identityToken, String expectedAudience) {
        try {
            JsonNode header = parseJwtSection(identityToken, 0);
            String kid = text(header, "kid");
            JsonNode keysResponse = getJson(URI.create("https://appleid.apple.com/auth/keys"));
            JsonNode keyNode = null;
            for (JsonNode item : keysResponse.path("keys")) {
                if (kid.equals(text(item, "kid"))) {
                    keyNode = item;
                    break;
                }
            }
            if (keyNode == null) {
                throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "未找到匹配的 Apple 公钥");
            }

            PublicKey publicKey = buildApplePublicKey(keyNode);
            Claims claims = Jwts.parser()
                    .verifyWith((RSAPublicKey) publicKey)
                    .build()
                    .parseSignedClaims(identityToken)
                    .getPayload();

            if (!"https://appleid.apple.com".equals(claims.getIssuer())) {
                throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "Apple token issuer 非法");
            }
            if (!matchesAppleAudience(claims, expectedAudience)) {
                throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "Apple token audience 不匹配");
            }
            return claims;
        } catch (BizException ex) {
            throw ex;
        } catch (JwtException | IllegalArgumentException ex) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "Apple identityToken 校验失败: " + ex.getMessage());
        }
    }

    private PublicKey buildApplePublicKey(JsonNode keyNode) {
        try {
            byte[] modulus = Base64.getUrlDecoder().decode(text(keyNode, "n"));
            byte[] exponent = Base64.getUrlDecoder().decode(text(keyNode, "e"));
            RSAPublicKeySpec spec = new RSAPublicKeySpec(new BigInteger(1, modulus), new BigInteger(1, exponent));
            return KeyFactory.getInstance("RSA").generatePublic(spec);
        } catch (Exception ex) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "Apple 公钥解析失败: " + ex.getMessage());
        }
    }

    private boolean matchesAppleAudience(Claims claims, String expectedAudience) {
        Object audience = claims.get("aud");
        if (audience instanceof String value) {
            return expectedAudience.equals(value);
        }
        if (audience instanceof Collection<?> values) {
            return values.stream().anyMatch(item -> expectedAudience.equals(String.valueOf(item)));
        }
        return expectedAudience.equals(claims.getAudience());
    }

    private JsonNode parseJwtSection(String jwt, int index) {
        try {
            String[] parts = jwt.split("\\.");
            if (parts.length <= index) {
                throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "Apple identityToken 格式错误");
            }
            return parseJson(new String(Base64.getUrlDecoder().decode(parts[index]), StandardCharsets.UTF_8));
        } catch (IllegalArgumentException ex) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "Apple identityToken Base64 解码失败");
        }
    }

    private JsonNode decryptWechatMiniUserInfo(String sessionKey, String encryptedData, String iv) {
        try {
            Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
            cipher.init(
                    Cipher.DECRYPT_MODE,
                    new SecretKeySpec(Base64.getDecoder().decode(sessionKey), "AES"),
                    new IvParameterSpec(Base64.getDecoder().decode(iv)));
            byte[] plainBytes = cipher.doFinal(Base64.getDecoder().decode(encryptedData));
            return parseJson(new String(plainBytes, StandardCharsets.UTF_8));
        } catch (Exception ex) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "微信小程序用户信息解密失败: " + ex.getMessage());
        }
    }

    private JsonNode parseJson(String raw) {
        try {
            return objectMapper.readTree(firstNonBlank(raw, "{}"));
        } catch (JsonProcessingException ex) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "第三方平台返回了无法解析的响应");
        }
    }

    private String mergeRawData(JsonNode... nodes) {
        try {
            Map<String, JsonNode> merged = new LinkedHashMap<>();
            for (int i = 0; i < nodes.length; i++) {
                JsonNode node = nodes[i];
                if (node != null && !node.isNull() && !node.isMissingNode()) {
                    merged.put("part" + i, node);
                }
            }
            return merged.isEmpty() ? null : objectMapper.writeValueAsString(merged);
        } catch (JsonProcessingException ex) {
            return null;
        }
    }

    private void checkWechatError(JsonNode node, String messagePrefix) {
        if (hasWechatError(node)) {
            String message = firstNonBlank(text(node, "errmsg"), text(node, "msg"), messagePrefix);
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, messagePrefix + ": " + message);
        }
    }

    private boolean hasWechatError(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return false;
        }
        JsonNode errCode = node.get("errcode");
        return errCode != null && !errCode.isNull() && errCode.asInt(0) != 0;
    }

    private void checkProviderError(JsonNode node, String defaultMessage) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, defaultMessage);
        }
        if (node.hasNonNull("errcode") && node.path("errcode").asInt(0) != 0) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, firstNonBlank(text(node, "errmsg"), defaultMessage));
        }
        if (node.hasNonNull("code") && node.path("code").isInt() && node.path("code").asInt() != 0) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, firstNonBlank(text(node, "message"), defaultMessage));
        }
    }

    private void ensureProfileHasPrincipal(OauthAuthenticatedProfile profile, String errorMessage) {
        if (!StringUtils.hasText(profile.getOpenId()) && !StringUtils.hasText(profile.getUnionId()) && !StringUtils.hasText(profile.getEmail())) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, errorMessage);
        }
        if (!StringUtils.hasText(profile.getOpenId())) {
            profile.setOpenId(firstNonBlank(profile.getUnionId(), profile.getEmail(), profile.getPhone()));
        }
    }

    private String safeToJson(JsonNode node) {
        try {
            return node == null ? null : objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException ex) {
            return null;
        }
    }

    private String text(JsonNode node, String fieldName) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return null;
        }
        JsonNode value = node.get(fieldName);
        if (value == null || value.isNull()) {
            return null;
        }
        String textValue = value.asText();
        return StringUtils.hasText(textValue) ? textValue.trim() : null;
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }

    private void requireText(String value, String message) {
        if (!StringUtils.hasText(value)) {
            throw new BizException(ResultCode.PARAM_ERROR, message);
        }
    }

    private String normalizePem(String pem) {
        if (!StringUtils.hasText(pem)) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "第三方平台密钥未配置");
        }
        return pem
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replace("-----BEGIN RSA PRIVATE KEY-----", "")
                .replace("-----END RSA PRIVATE KEY-----", "")
                .replaceAll("\\s+", "");
    }

    private boolean isWechatWebEnabled() {
        return isEnabled("security.oauth.wechat.enabled");
    }

    private boolean isWechatMiniEnabled() {
        return isEnabled("security.oauth.wechat-mini.enabled");
    }

    private boolean isDingTalkEnabled() {
        return isEnabled("security.oauth.dingtalk.enabled");
    }

    private boolean isAlipayEnabled() {
        return isEnabled("security.oauth.alipay.enabled");
    }

    private boolean isAppleEnabled() {
        return isEnabled("security.oauth.apple.enabled");
    }

    private boolean isEnabled(String configKey) {
        return Boolean.parseBoolean(systemConfigService.getValue(0L, configKey, "false"));
    }

    private WechatWebConfig loadWechatWebConfig(boolean requireEnabled) {
        if (requireEnabled && !isWechatWebEnabled()) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "微信登录未启用");
        }
        return new WechatWebConfig(
                readRequiredConfig("security.oauth.wechat.app_id"),
                readRequiredConfig("security.oauth.wechat.app_secret"));
    }

    private WechatMiniConfig loadWechatMiniConfig(boolean requireEnabled) {
        if (requireEnabled && !isWechatMiniEnabled()) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "微信小程序登录未启用");
        }
        return new WechatMiniConfig(
                readRequiredConfig("security.oauth.wechat-mini.app_id"),
                readRequiredConfig("security.oauth.wechat-mini.app_secret"));
    }

    private DingTalkConfig loadDingTalkConfig(boolean requireEnabled) {
        if (requireEnabled && !isDingTalkEnabled()) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "钉钉登录未启用");
        }
        return new DingTalkConfig(
                readRequiredConfig("security.oauth.dingtalk.client_id"),
                readRequiredConfig("security.oauth.dingtalk.client_secret"));
    }

    private AlipayConfig loadAlipayConfig(boolean requireEnabled) {
        if (requireEnabled && !isAlipayEnabled()) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "支付宝登录未启用");
        }
        return new AlipayConfig(
                readRequiredConfig("security.oauth.alipay.app_id"),
                readRequiredConfig("security.oauth.alipay.private_key_pem"),
                systemConfigService.getValue(0L, "security.oauth.alipay.gateway", ALIPAY_GATEWAY_DEFAULT));
    }

    private AppleConfig loadAppleConfig(boolean requireEnabled) {
        if (requireEnabled && !isAppleEnabled()) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "Apple 登录未启用");
        }
        return new AppleConfig(readRequiredConfig("security.oauth.apple.client_id"));
    }

    private String readRequiredConfig(String configKey) {
        String value = systemConfigService.getValue(0L, configKey);
        if (!StringUtils.hasText(value)) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "缺少第三方登录配置: " + configKey);
        }
        return value.trim();
    }

    private record WechatWebConfig(String appId, String appSecret) {
    }

    private record WechatMiniConfig(String appId, String appSecret) {
    }

    private record DingTalkConfig(String clientId, String clientSecret) {
    }

    private record AlipayConfig(String appId, String privateKeyPem, String gateway) {
    }

    private record AppleConfig(String clientId) {
    }
}
