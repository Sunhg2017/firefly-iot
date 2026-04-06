package com.songhg.firefly.iot.system.service;

import com.songhg.firefly.iot.common.constant.AuthConstants;
import com.songhg.firefly.iot.common.enums.LoginMethod;
import com.songhg.firefly.iot.common.enums.OauthProvider;
import com.songhg.firefly.iot.common.enums.Platform;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.system.dto.LoginResponse;
import com.songhg.firefly.iot.system.dto.OauthAuthorizeUrlRequest;
import com.songhg.firefly.iot.system.dto.OauthBindRequest;
import com.songhg.firefly.iot.system.dto.OauthBindingVO;
import com.songhg.firefly.iot.system.dto.OauthLoginRequest;
import com.songhg.firefly.iot.system.entity.User;
import com.songhg.firefly.iot.system.entity.UserOauthBinding;
import com.songhg.firefly.iot.system.mapper.UserMapper;
import com.songhg.firefly.iot.system.mapper.UserOauthBindingMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

@ExtendWith(MockitoExtension.class)
class OauthIntegrationServiceTest {

    @Mock
    private AuthService authService;

    @Mock
    private SystemConfigService systemConfigService;

    @Mock
    private UserMapper userMapper;

    @Mock
    private UserOauthBindingMapper oauthBindingMapper;

    @Mock
    private StringRedisTemplate redisTemplate;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RestTemplate restTemplate = new RestTemplate();
    private MockRestServiceServer server;
    private OauthIntegrationService service;
    private Map<String, String> configs;

    @BeforeEach
    void setUp() {
        server = MockRestServiceServer.bindTo(restTemplate).ignoreExpectOrder(true).build();
        service = new OauthIntegrationService(
                authService,
                systemConfigService,
                userMapper,
                oauthBindingMapper,
                redisTemplate,
                objectMapper,
                restTemplate);

        configs = new HashMap<>();
        lenient().when(systemConfigService.getValue(eq(0L), anyString()))
                .thenAnswer(invocation -> configs.get(invocation.getArgument(1, String.class)));
        lenient().when(systemConfigService.getValue(eq(0L), anyString(), anyString()))
                .thenAnswer(invocation -> configs.getOrDefault(
                        invocation.getArgument(1, String.class),
                        invocation.getArgument(2, String.class)));

        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    @Test
    void shouldLoginWithExistingWechatBinding() {
        configs.put("security.oauth.wechat.enabled", "true");
        configs.put("security.oauth.wechat.app_id", "wx-app");
        configs.put("security.oauth.wechat.app_secret", "wx-secret");

        server.expect(once(), requestTo(containsString("sns/oauth2/access_token")))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"access_token":"wx-token","openid":"wx-open-1","unionid":"wx-union-1"}
                        """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo(containsString("sns/userinfo")))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"nickname":"wechat-user","headimgurl":"https://avatar","unionid":"wx-union-1"}
                        """, MediaType.APPLICATION_JSON));

        UserOauthBinding binding = binding(11L, 101L, OauthProvider.WECHAT, "wx-open-1", "wx-union-1", "wx-app");
        User user = user(11L, 200L, "wechat.admin", null, null);
        LoginResponse loginResponse = loginResponse("wechat-access");

        when(oauthBindingMapper.selectOne(any())).thenReturn(binding, binding, null);
        when(userMapper.selectById(11L)).thenReturn(user);
        when(authService.oauthLogin(eq(user), eq(LoginMethod.WECHAT), eq(Platform.WEB), eq("fp-wechat"), eq("127.0.0.1"), eq("JUnit")))
                .thenReturn(loginResponse);

        OauthLoginRequest request = new OauthLoginRequest();
        request.setCode("wechat-code");
        request.setPlatform(Platform.WEB);
        request.setFingerprint("fp-wechat");

        LoginResponse response = service.loginWithWechat(request, "127.0.0.1", "JUnit");

        assertThat(response.getAccessToken()).isEqualTo("wechat-access");
        verify(oauthBindingMapper, atLeastOnce()).updateById(any(UserOauthBinding.class));
        server.verify();
    }

    @Test
    void shouldLoginWechatMiniByUnionBindingAndInsertCurrentAppBinding() {
        configs.put("security.oauth.wechat-mini.enabled", "true");
        configs.put("security.oauth.wechat-mini.app_id", "mini-app");
        configs.put("security.oauth.wechat-mini.app_secret", "mini-secret");

        server.expect(once(), requestTo(containsString("jscode2session")))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"openid":"mini-open-1","unionid":"mini-union-1","session_key":"dGVzdC1zZXNzaW9uLWtleQ=="}
                        """, MediaType.APPLICATION_JSON));

        UserOauthBinding unionBinding = binding(22L, 102L, OauthProvider.WECHAT, "legacy-open", "mini-union-1", "legacy-app");
        User user = user(22L, 201L, "mini.user", null, null);
        LoginResponse loginResponse = loginResponse("mini-access");

        when(oauthBindingMapper.selectOne(any())).thenReturn(null, unionBinding, null, unionBinding);
        when(userMapper.selectById(22L)).thenReturn(user);
        when(authService.oauthLogin(eq(user), eq(LoginMethod.WECHAT_MINI), eq(Platform.MINI_WECHAT), eq("fp-mini"), eq("127.0.0.2"), eq("JUnit")))
                .thenReturn(loginResponse);

        OauthLoginRequest request = new OauthLoginRequest();
        request.setCode("mini-code");
        request.setPlatform(Platform.MINI_WECHAT);
        request.setFingerprint("fp-mini");

        LoginResponse response = service.loginWithWechatMini(request, "127.0.0.2", "JUnit");

        assertThat(response.getAccessToken()).isEqualTo("mini-access");
        verify(oauthBindingMapper).insert(any(UserOauthBinding.class));
        server.verify();
    }

    @Test
    void shouldBindDingTalkAccountForCurrentUser() {
        configs.put("security.oauth.dingtalk.enabled", "true");
        configs.put("security.oauth.dingtalk.client_id", "ding-client");
        configs.put("security.oauth.dingtalk.client_secret", "ding-secret");

        server.expect(once(), requestTo("https://api.dingtalk.com/v1.0/oauth2/userAccessToken"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("""
                        {"accessToken":"ding-token"}
                        """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("https://api.dingtalk.com/v1.0/contact/users/me"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("x-acs-dingtalk-access-token", "ding-token"))
                .andRespond(withSuccess("""
                        {"unionId":"ding-union","nick":"ding-user","avatarUrl":"https://avatar","mobile":"13800000000"}
                        """, MediaType.APPLICATION_JSON));

        User currentUser = user(77L, 300L, "current.user", null, "13800009999");
        when(userMapper.selectById(77L)).thenReturn(currentUser);
        when(oauthBindingMapper.selectOne(any())).thenReturn(null, null);

        OauthBindRequest request = new OauthBindRequest();
        request.setProvider(OauthProvider.DINGTALK);
        request.setCode("ding-code");

        OauthBindingVO response = service.bindCurrentUser(77L, request);

        assertThat(response.getProvider()).isEqualTo(OauthProvider.DINGTALK);
        ArgumentCaptor<UserOauthBinding> captor = ArgumentCaptor.forClass(UserOauthBinding.class);
        verify(oauthBindingMapper).insert(captor.capture());
        assertThat(captor.getValue().getTenantId()).isEqualTo(300L);
        assertThat(captor.getValue().getOpenId()).isEqualTo("ding-union");
        server.verify();
    }

    @Test
    void shouldLoginAlipayByEmailFallbackAndCreateBinding() throws Exception {
        configs.put("security.oauth.alipay.enabled", "true");
        configs.put("security.oauth.alipay.app_id", "ali-app");
        configs.put("security.oauth.alipay.private_key_pem", toPem(generateKeyPair().getPrivate().getEncoded()));

        server.expect(once(), requestTo("https://openapi.alipay.com/gateway.do"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().string(containsString("method=alipay.system.oauth.token")))
                .andRespond(withSuccess("""
                        {"alipay_system_oauth_token_response":{"user_id":"2088000000001","access_token":"ali-token"}}
                        """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("https://openapi.alipay.com/gateway.do"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().string(containsString("method=alipay.user.info.share")))
                .andRespond(withSuccess("""
                        {"alipay_user_info_share_response":{"user_id":"2088000000001","nick_name":"ali-user","email":"ali@example.com"}}
                        """, MediaType.APPLICATION_JSON));

        User user = user(55L, 205L, "ali.user", "ali@example.com", null);
        LoginResponse loginResponse = loginResponse("alipay-access");

        when(oauthBindingMapper.selectOne(any())).thenReturn(null, null, null, null);
        when(userMapper.findByIdentifierGlobal("ali@example.com")).thenReturn(List.of(user));
        when(authService.oauthLogin(eq(user), eq(LoginMethod.ALIPAY), eq(Platform.MINI_ALIPAY), eq("fp-ali"), eq("127.0.0.3"), eq("JUnit")))
                .thenReturn(loginResponse);

        OauthLoginRequest request = new OauthLoginRequest();
        request.setAuthCode("ali-auth-code");
        request.setPlatform(Platform.MINI_ALIPAY);
        request.setFingerprint("fp-ali");

        LoginResponse response = service.loginWithAlipay(request, "127.0.0.3", "JUnit");

        assertThat(response.getAccessToken()).isEqualTo("alipay-access");
        verify(oauthBindingMapper).insert(any(UserOauthBinding.class));
        server.verify();
    }

    @Test
    void shouldLoginAppleWithExistingBinding() throws Exception {
        configs.put("security.oauth.apple.enabled", "true");
        configs.put("security.oauth.apple.client_id", "com.firefly.web");

        KeyPair keyPair = generateKeyPair();
        String kid = "apple-kid-1";
        String identityToken = buildAppleIdentityToken(keyPair, kid, "com.firefly.web", "apple-user-1");

        server.expect(once(), requestTo("https://appleid.apple.com/auth/keys"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess(appleKeysResponse((RSAPublicKey) keyPair.getPublic(), kid), MediaType.APPLICATION_JSON));

        UserOauthBinding binding = binding(88L, 103L, OauthProvider.APPLE, "apple-user-1", null, "com.firefly.web");
        User user = user(88L, 208L, "apple.user", "apple@example.com", null);
        LoginResponse loginResponse = loginResponse("apple-access");

        when(oauthBindingMapper.selectOne(any())).thenReturn(binding, binding, null);
        when(userMapper.selectById(88L)).thenReturn(user);
        when(authService.oauthLogin(eq(user), eq(LoginMethod.APPLE), eq(Platform.APP_IOS), eq("fp-apple"), eq("127.0.0.4"), eq("JUnit")))
                .thenReturn(loginResponse);

        OauthLoginRequest request = new OauthLoginRequest();
        request.setIdentityToken(identityToken);
        request.setPlatform(Platform.APP_IOS);
        request.setFingerprint("fp-apple");

        LoginResponse response = service.loginWithApple(request, "127.0.0.4", "JUnit");

        assertThat(response.getAccessToken()).isEqualTo("apple-access");
        server.verify();
    }

    @Test
    void shouldBuildWechatAuthorizeUrlAndPersistOauthState() {
        configs.put("security.oauth.wechat.enabled", "true");
        configs.put("security.oauth.wechat.app_id", "wx-app");
        configs.put("security.oauth.wechat.app_secret", "wx-secret");

        OauthAuthorizeUrlRequest request = new OauthAuthorizeUrlRequest();
        request.setProvider(OauthProvider.WECHAT);
        request.setAction("login");
        request.setRedirectUri("https://console.example.com/login/oauth/callback?provider=WECHAT");

        var response = service.buildAuthorizeUrl(request, null);

        assertThat(response.getAuthorizeUrl()).contains("open.weixin.qq.com/connect/qrconnect");
        verify(redisTemplate.opsForValue(), times(1))
                .set(org.mockito.ArgumentMatchers.startsWith(AuthConstants.REDIS_OAUTH_STATE), anyString(), eq((long) AuthConstants.OAUTH_STATE_EXPIRE_SECONDS), eq(java.util.concurrent.TimeUnit.SECONDS));
    }

    @Test
    void shouldFailWhenOauthAccountIsUnboundAndNoLocalMatchExists() {
        configs.put("security.oauth.wechat.enabled", "true");
        configs.put("security.oauth.wechat.app_id", "wx-app");
        configs.put("security.oauth.wechat.app_secret", "wx-secret");

        server.expect(once(), requestTo(containsString("sns/oauth2/access_token")))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"access_token":"wx-token","openid":"wx-open-404"}
                        """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo(containsString("sns/userinfo")))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"nickname":"unknown-user"}
                        """, MediaType.APPLICATION_JSON));

        when(oauthBindingMapper.selectOne(any())).thenReturn(null, null);

        OauthLoginRequest request = new OauthLoginRequest();
        request.setCode("wx-code");
        request.setPlatform(Platform.WEB);

        assertThatThrownBy(() -> service.loginWithWechat(request, "127.0.0.5", "JUnit"))
                .isInstanceOf(BizException.class)
                .hasMessageContaining("第三方账号未绑定");
        server.verify();
    }

    private User user(Long id, Long tenantId, String username, String email, String phone) {
        User user = new User();
        user.setId(id);
        user.setTenantId(tenantId);
        user.setUsername(username);
        user.setEmail(email);
        user.setPhone(phone);
        return user;
    }

    private UserOauthBinding binding(Long userId, Long tenantId, OauthProvider provider, String openId, String unionId, String appId) {
        UserOauthBinding binding = new UserOauthBinding();
        binding.setId(System.nanoTime());
        binding.setUserId(userId);
        binding.setTenantId(tenantId);
        binding.setProvider(provider);
        binding.setOpenId(openId);
        binding.setUnionId(unionId);
        binding.setAppId(appId);
        return binding;
    }

    private LoginResponse loginResponse(String accessToken) {
        LoginResponse response = new LoginResponse();
        response.setAccessToken(accessToken);
        response.setRefreshToken(accessToken + "-refresh");
        return response;
    }

    private KeyPair generateKeyPair() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        return generator.generateKeyPair();
    }

    private String toPem(byte[] keyBytes) {
        return "-----BEGIN PRIVATE KEY-----\n"
                + Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.UTF_8)).encodeToString(keyBytes)
                + "\n-----END PRIVATE KEY-----";
    }

    private String buildAppleIdentityToken(KeyPair keyPair, String kid, String audience, String subject) {
        return Jwts.builder()
                .header()
                .add("kid", kid)
                .and()
                .issuer("https://appleid.apple.com")
                .audience().add(audience).and()
                .subject(subject)
                .claim("email", "apple@example.com")
                .issuedAt(java.util.Date.from(Instant.now()))
                .expiration(java.util.Date.from(Instant.now().plusSeconds(600)))
                .signWith(keyPair.getPrivate(), Jwts.SIG.RS256)
                .compact();
    }

    private String appleKeysResponse(RSAPublicKey publicKey, String kid) {
        String modulus = Base64.getUrlEncoder().withoutPadding().encodeToString(publicKey.getModulus().toByteArray()[0] == 0
                ? java.util.Arrays.copyOfRange(publicKey.getModulus().toByteArray(), 1, publicKey.getModulus().toByteArray().length)
                : publicKey.getModulus().toByteArray());
        String exponent = Base64.getUrlEncoder().withoutPadding().encodeToString(publicKey.getPublicExponent().toByteArray());
        return """
                {
                  "keys": [
                    {
                      "kty": "RSA",
                      "kid": "%s",
                      "use": "sig",
                      "alg": "RS256",
                      "n": "%s",
                      "e": "%s"
                    }
                  ]
                }
                """.formatted(kid, modulus, exponent);
    }
}
