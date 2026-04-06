package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.constant.AuthConstants;
import com.songhg.firefly.iot.common.context.AppContext;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.LoginMethod;
import com.songhg.firefly.iot.common.enums.Platform;
import com.songhg.firefly.iot.common.enums.SessionStatus;
import com.songhg.firefly.iot.common.enums.TenantStatus;
import com.songhg.firefly.iot.common.enums.UserStatus;
import com.songhg.firefly.iot.common.enums.UserType;
import com.songhg.firefly.iot.common.event.EventPublisher;
import com.songhg.firefly.iot.common.event.EventTopics;
import com.songhg.firefly.iot.common.event.LoginEvent;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.convert.UserSessionConvert;
import com.songhg.firefly.iot.system.dto.AdminSessionQueryDTO;
import com.songhg.firefly.iot.system.dto.AdminSessionTarget;
import com.songhg.firefly.iot.system.dto.AdminSessionVO;
import com.songhg.firefly.iot.system.dto.LoginLogQueryDTO;
import com.songhg.firefly.iot.system.dto.LoginLogVO;
import com.songhg.firefly.iot.system.dto.LoginRequest;
import com.songhg.firefly.iot.system.dto.LoginResponse;
import com.songhg.firefly.iot.system.dto.OauthBindingVO;
import com.songhg.firefly.iot.system.dto.UserSessionVO;
import com.songhg.firefly.iot.system.entity.LoginLog;
import com.songhg.firefly.iot.system.entity.Tenant;
import com.songhg.firefly.iot.system.entity.User;
import com.songhg.firefly.iot.system.entity.UserOauthBinding;
import com.songhg.firefly.iot.system.entity.UserSession;
import com.songhg.firefly.iot.system.mapper.LoginLogMapper;
import com.songhg.firefly.iot.system.mapper.RoleMapper;
import com.songhg.firefly.iot.system.mapper.TenantMapper;
import com.songhg.firefly.iot.system.mapper.UserMapper;
import com.songhg.firefly.iot.system.mapper.UserOauthBindingMapper;
import com.songhg.firefly.iot.system.mapper.UserSessionMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Collections;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private static final String REFRESH_TENANT_KEY_PREFIX = "auth:refresh:tenant:";

    private final JwtService jwtService;
    private final UserSessionMapper sessionMapper;
    private final LoginLogMapper loginLogMapper;
    private final UserOauthBindingMapper oauthBindingMapper;
    private final UserMapper userMapper;
    private final RoleMapper roleMapper;
    private final TenantMapper tenantMapper;
    private final PermissionService permissionService;
    private final PasswordEncoder passwordEncoder;
    private final StringRedisTemplate redisTemplate;
    private final EventPublisher eventPublisher;
    private final UserDomainService userDomainService;
    private final WorkspaceMenuAccessService workspaceMenuAccessService;

    @Transactional
    public LoginResponse passwordLogin(LoginRequest req, String remoteIp, String userAgent) {
        String identifier = resolveLoginIdentifier(req);
        if (!StringUtils.hasText(identifier) || !StringUtils.hasText(req.getPassword())) {
            throw new BizException(ResultCode.PARAM_ERROR, "username/email/phone and password are required");
        }

        User user = requireUniqueLoginUser(identifier, req, remoteIp, userAgent);
        Tenant tenant = requireLoginTenant(user.getTenantId());
        return withTenantContext(tenant.getId(), () -> {
            assertUserCanLogin(user, req, tenant.getId(), remoteIp, userAgent);
            if (!passwordEncoder.matches(req.getPassword(), user.getPasswordHash())) {
                onPasswordMismatch(user, req, tenant.getId(), remoteIp, userAgent);
                throw new BizException(ResultCode.AUTH_INVALID_CREDENTIALS);
            }
            return onLoginSuccess(user, tenant, req, remoteIp, userAgent);
        });
    }

    @Transactional
    public LoginResponse smsLogin(LoginRequest req, String remoteIp, String userAgent) {
        if (!StringUtils.hasText(req.getPhone()) || !StringUtils.hasText(req.getSmsCode())) {
            throw new BizException(ResultCode.PARAM_ERROR, "phone and smsCode are required");
        }

        String cacheKey = AuthConstants.REDIS_SMS_CODE + req.getPhone() + ":LOGIN";
        String cachedCode = redisTemplate.opsForValue().get(cacheKey);
        if (!StringUtils.hasText(cachedCode) || !cachedCode.equals(req.getSmsCode())) {
            throw new BizException(ResultCode.AUTH_SMS_CODE_INVALID);
        }
        redisTemplate.delete(cacheKey);

        User user = requireUniqueLoginUser(req.getPhone(), req, remoteIp, userAgent);
        Tenant tenant = requireLoginTenant(user.getTenantId());
        return withTenantContext(tenant.getId(), () -> {
            assertUserCanLogin(user, req, tenant.getId(), remoteIp, userAgent);
            return onLoginSuccess(user, tenant, req, remoteIp, userAgent);
        });
    }

    @Transactional
    public LoginResponse oauthLogin(User user,
                                    LoginMethod loginMethod,
                                    Platform platform,
                                    String fingerprint,
                                    String remoteIp,
                                    String userAgent) {
        if (user == null || user.getId() == null) {
            throw new BizException(ResultCode.AUTH_OAUTH_FAILED, "oauth login user is missing");
        }
        Tenant tenant = requireLoginTenant(user.getTenantId());
        return withTenantContext(tenant.getId(), () -> {
            LoginRequest req = new LoginRequest();
            req.setLoginMethod(loginMethod);
            req.setPlatform(platform);
            req.setFingerprint(fingerprint);
            req.setUsername(user.getUsername());
            assertUserCanLogin(user, req, tenant.getId(), remoteIp, userAgent);
            return onLoginSuccess(user, tenant, req, remoteIp, userAgent);
        });
    }

    public void sendSmsCode(String phone, String purpose, String remoteIp) {
        String rateKey = AuthConstants.REDIS_SMS_RATE + phone;
        if (Boolean.TRUE.equals(redisTemplate.hasKey(rateKey))) {
            throw new BizException(ResultCode.AUTH_SMS_RATE_LIMITED, "please retry later");
        }

        String dailyKey = AuthConstants.REDIS_SMS_DAILY + phone + ":" + LocalDateTime.now().toLocalDate();
        String dailyCount = redisTemplate.opsForValue().get(dailyKey);
        if (dailyCount != null && Integer.parseInt(dailyCount) >= AuthConstants.SMS_DAILY_LIMIT) {
            throw new BizException(ResultCode.AUTH_SMS_RATE_LIMITED, "daily SMS limit reached");
        }

        String code = String.format("%06d", (int) (Math.random() * 1_000_000));
        String codeKey = AuthConstants.REDIS_SMS_CODE + phone + ":" + purpose;
        redisTemplate.opsForValue().set(codeKey, code, AuthConstants.SMS_CODE_EXPIRE_SECONDS, TimeUnit.SECONDS);
        redisTemplate.opsForValue().set(rateKey, "1", AuthConstants.SMS_RATE_LIMIT_SECONDS, TimeUnit.SECONDS);
        redisTemplate.opsForValue().increment(dailyKey);
        redisTemplate.expire(dailyKey, 48, TimeUnit.HOURS);

        log.info("SMS code sent: phone={}, purpose={}, ip={}", phone, purpose, remoteIp);
    }

    public LoginResponse refreshToken(String refreshToken) {
        String oldRefreshHash = sha256(refreshToken);
        String tenantIdStr = redisTemplate.opsForValue().get(refreshTenantKey(oldRefreshHash));
        if (!StringUtils.hasText(tenantIdStr)) {
            throw new BizException(ResultCode.AUTH_REFRESH_TOKEN_INVALID);
        }

        Long tenantId;
        try {
            tenantId = Long.parseLong(tenantIdStr);
        } catch (NumberFormatException ex) {
            redisTemplate.delete(refreshTenantKey(oldRefreshHash));
            throw new BizException(ResultCode.AUTH_REFRESH_TOKEN_INVALID);
        }

        return withTenantContext(tenantId, () -> {
            UserSession session = sessionMapper.selectOne(
                    new LambdaQueryWrapper<UserSession>()
                            .eq(UserSession::getRefreshTokenHash, oldRefreshHash)
                            .eq(UserSession::getStatus, SessionStatus.ACTIVE));
            if (session == null) {
                redisTemplate.delete(refreshTenantKey(oldRefreshHash));
                throw new BizException(ResultCode.AUTH_REFRESH_TOKEN_INVALID);
            }
            if (session.getRefreshExpiresAt().isBefore(LocalDateTime.now())) {
                session.setStatus(SessionStatus.EXPIRED);
                sessionMapper.updateById(session);
                redisTemplate.delete(refreshTenantKey(oldRefreshHash));
                throw new BizException(ResultCode.AUTH_REFRESH_TOKEN_INVALID);
            }

            Set<String> roles = loadUserRoleCodes(session.getUserId());
            String newAccessToken = jwtService.generateAccessToken(
                    session.getUserId(),
                    session.getTenantId(),
                    session.getPlatform().getValue(),
                    roles,
                    "");

            String newRefreshToken = jwtService.generateRefreshToken();
            String newRefreshHash = sha256(newRefreshToken);
            String newAccessHash = sha256(newAccessToken);
            long refreshExpireSec = AuthConstants.REFRESH_TOKEN_EXPIRE_SECONDS;

            session.setAccessTokenHash(newAccessHash);
            session.setRefreshTokenHash(newRefreshHash);
            session.setAccessExpiresAt(LocalDateTime.ofInstant(
                    Instant.now().plusSeconds(jwtService.getAccessTokenExpireSeconds()), ZoneId.systemDefault()));
            session.setRefreshExpiresAt(LocalDateTime.ofInstant(
                    Instant.now().plusSeconds(refreshExpireSec), ZoneId.systemDefault()));
            session.setLastActiveAt(LocalDateTime.now());
            sessionMapper.updateById(session);

            redisTemplate.delete(refreshTenantKey(oldRefreshHash));
            redisTemplate.opsForValue().set(refreshTenantKey(newRefreshHash), String.valueOf(session.getTenantId()),
                    refreshExpireSec, TimeUnit.SECONDS);

            LoginResponse resp = new LoginResponse();
            resp.setAccessToken(newAccessToken);
            resp.setRefreshToken(newRefreshToken);
            resp.setExpiresIn(jwtService.getAccessTokenExpireSeconds());
            return resp;
        });
    }

    @Transactional
    public void logout(Long userId, Platform platform, String accessToken) {
        if (accessToken != null) {
            String tokenHash = sha256(accessToken);
            redisTemplate.opsForValue().set(
                    AuthConstants.REDIS_TOKEN_BLACKLIST + tokenHash,
                    "LOGOUT",
                    jwtService.getAccessTokenExpireSeconds(),
                    TimeUnit.SECONDS);
        }

        List<UserSession> sessions = sessionMapper.selectList(
                new LambdaQueryWrapper<UserSession>()
                        .eq(UserSession::getUserId, userId)
                        .eq(UserSession::getPlatform, platform)
                        .eq(UserSession::getStatus, SessionStatus.ACTIVE));
        for (UserSession s : sessions) {
            s.setStatus(SessionStatus.LOGOUT);
            s.setUpdatedAt(LocalDateTime.now());
            sessionMapper.updateById(s);
            redisTemplate.delete(refreshTenantKey(s.getRefreshTokenHash()));
        }

        eventPublisher.publish(EventTopics.AUTH_EVENTS, LoginEvent.logout(null, userId, platform.getValue()));
    }

    @Transactional
    public void logoutAll(Long userId) {
        redisTemplate.opsForValue().set(
                AuthConstants.REDIS_TOKEN_REVOKE_BEFORE + userId,
                String.valueOf(Instant.now().getEpochSecond()),
                AuthConstants.REFRESH_TOKEN_EXPIRE_SECONDS,
                TimeUnit.SECONDS);

        List<UserSession> sessions = sessionMapper.selectList(
                new LambdaQueryWrapper<UserSession>()
                        .eq(UserSession::getUserId, userId)
                        .eq(UserSession::getStatus, SessionStatus.ACTIVE));
        for (UserSession s : sessions) {
            s.setStatus(SessionStatus.LOGOUT);
            s.setUpdatedAt(LocalDateTime.now());
            sessionMapper.updateById(s);
            redisTemplate.delete(refreshTenantKey(s.getRefreshTokenHash()));
        }
    }

    public List<UserSession> getUserSessions(Long userId) {
        return sessionMapper.selectList(
                new LambdaQueryWrapper<UserSession>()
                        .eq(UserSession::getUserId, userId)
                        .eq(UserSession::getStatus, SessionStatus.ACTIVE)
                        .orderByDesc(UserSession::getLastActiveAt));
    }

    public List<UserSessionVO> getUserSessionVOs(Long userId) {
        List<UserSession> sessions = getUserSessions(userId);
        return UserSessionConvert.INSTANCE.toVOList(sessions);
    }

    @Transactional
    public void kickSession(Long sessionId, Long operatorId) {
        UserSession session = sessionMapper.selectById(sessionId);
        if (session == null || session.getStatus() != SessionStatus.ACTIVE) {
            return;
        }

        session.setStatus(SessionStatus.KICKED);
        session.setUpdatedAt(LocalDateTime.now());
        sessionMapper.updateById(session);
        redisTemplate.delete(refreshTenantKey(session.getRefreshTokenHash()));

        redisTemplate.opsForValue().set(
                AuthConstants.REDIS_TOKEN_BLACKLIST + session.getAccessTokenHash(),
                "KICKED",
                jwtService.getAccessTokenExpireSeconds(),
                TimeUnit.SECONDS);

        eventPublisher.publish(
                EventTopics.SESSION_EVENTS,
                LoginEvent.sessionKicked(session.getTenantId(), session.getUserId(), sessionId, operatorId));
    }

    public void recordLoginLog(LoginRequest req, Long userId, Long tenantId,
                               String result, String failReason, String ip, String ua) {
        LoginLog logEntry = new LoginLog();
        logEntry.setUserId(userId);
        logEntry.setTenantId(tenantId);
        logEntry.setUsername(req.getUsername() != null ? req.getUsername() : req.getPhone());
        logEntry.setPlatform(req.getPlatform());
        logEntry.setLoginMethod(req.getLoginMethod());
        logEntry.setLoginIp(ip);
        logEntry.setUserAgent(ua);
        logEntry.setDeviceFingerprint(req.getFingerprint());
        logEntry.setResult(result);
        logEntry.setFailReason(failReason);
        logEntry.setCreatedAt(LocalDateTime.now());
        loginLogMapper.insert(logEntry);
    }

    @Transactional
    public void updatePushToken(Long userId, Platform platform, String pushToken, String pushChannel) {
        List<UserSession> sessions = sessionMapper.selectList(
                new LambdaQueryWrapper<UserSession>()
                        .eq(UserSession::getUserId, userId)
                        .eq(UserSession::getPlatform, platform)
                        .eq(UserSession::getStatus, SessionStatus.ACTIVE));
        for (UserSession s : sessions) {
            s.setPushToken(pushToken);
            s.setPushChannel(pushChannel);
            s.setUpdatedAt(LocalDateTime.now());
            sessionMapper.updateById(s);
        }
    }

    public List<OauthBindingVO> getUserOauthBindings(Long userId) {
        List<UserOauthBinding> bindings = oauthBindingMapper.selectList(
                new LambdaQueryWrapper<UserOauthBinding>()
                        .eq(UserOauthBinding::getUserId, userId)
                        .orderByDesc(UserOauthBinding::getCreatedAt));
        return bindings.stream().map(b -> {
            OauthBindingVO vo = new OauthBindingVO();
            vo.setId(b.getId());
            vo.setProvider(b.getProvider());
            vo.setNickname(b.getNickname());
            vo.setAvatarUrl(b.getAvatarUrl());
            vo.setCreatedAt(b.getCreatedAt());
            return vo;
        }).toList();
    }

    @Transactional
    public void deleteOauthBinding(Long bindingId, Long userId) {
        UserOauthBinding binding = oauthBindingMapper.selectById(bindingId);
        if (binding == null || !binding.getUserId().equals(userId)) {
            throw new BizException(ResultCode.PARAM_ERROR, "oauth binding not found");
        }
        User user = userMapper.selectById(userId);
        long bindingCount = oauthBindingMapper.selectCount(new LambdaQueryWrapper<UserOauthBinding>()
                .eq(UserOauthBinding::getUserId, userId));
        boolean hasPasswordLogin = user != null && StringUtils.hasText(user.getPasswordHash());
        boolean hasSmsLogin = user != null && StringUtils.hasText(user.getPhone());
        if (!hasPasswordLogin && !hasSmsLogin && bindingCount <= 1) {
            throw new BizException(ResultCode.PARAM_ERROR, "请至少保留一种可用登录方式");
        }
        oauthBindingMapper.deleteById(bindingId);
    }

    public IPage<AdminSessionVO> queryAdminSessions(AdminSessionQueryDTO query) {
        User currentUser = userDomainService.requireCurrentUser();
        boolean platformUser = currentUser.getUserType() == UserType.SYSTEM_OPS;
        Long currentTenantId = resolveAdminSessionScopeTenantId(currentUser);
        Page<AdminSessionVO> page = new Page<>(query.getPageNum(), query.getPageSize());
        return sessionMapper.selectAdminSessions(page, query, platformUser, currentTenantId);
    }

    @Transactional
    public void adminKickAdminSession(Long sessionId, Long operatorId) {
        AdminSessionTarget target = requireAdminSessionTarget(sessionId);
        withTenantContext(target.getTenantId(), () -> {
            kickSession(sessionId, operatorId);
            return null;
        });
    }

    @Transactional
    public void adminKickAdminUserByUsername(String username, Long operatorId) {
        String normalizedUsername = username == null ? null : username.trim();
        if (!StringUtils.hasText(normalizedUsername)) {
            throw new BizException(ResultCode.PARAM_ERROR, "username is required");
        }
        AdminSessionTarget target = requireAdminUserTarget(normalizedUsername);
        withTenantContext(target.getTenantId(), () -> {
            adminKickUser(target.getUserId(), operatorId);
            return null;
        });
    }

    @Transactional
    public void adminKickUser(Long userId, Long operatorId) {
        List<UserSession> sessions = sessionMapper.selectList(
                new LambdaQueryWrapper<UserSession>()
                        .eq(UserSession::getUserId, userId)
                        .eq(UserSession::getStatus, SessionStatus.ACTIVE));
        for (UserSession s : sessions) {
            s.setStatus(SessionStatus.KICKED);
            s.setUpdatedAt(LocalDateTime.now());
            sessionMapper.updateById(s);
            redisTemplate.delete(refreshTenantKey(s.getRefreshTokenHash()));
            if (s.getAccessTokenHash() != null) {
                redisTemplate.opsForValue().set(
                        AuthConstants.REDIS_TOKEN_BLACKLIST + s.getAccessTokenHash(),
                        "KICKED",
                        jwtService.getAccessTokenExpireSeconds(),
                        TimeUnit.SECONDS);
            }
        }
        log.info("Admin kicked all sessions: userId={}, count={}, by={}", userId, sessions.size(), operatorId);
    }

    public IPage<LoginLogVO> queryLoginLogs(LoginLogQueryDTO query) {
        LambdaQueryWrapper<LoginLog> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getKeyword())) {
            String keyword = query.getKeyword().trim();
            wrapper.and(w -> w.like(LoginLog::getUsername, keyword)
                    .or()
                    .like(LoginLog::getLoginIp, keyword));
        }
        if (query.getUserId() != null) {
            wrapper.eq(LoginLog::getUserId, query.getUserId());
        }
        if (query.getUsername() != null && !query.getUsername().isBlank()) {
            wrapper.like(LoginLog::getUsername, query.getUsername());
        }
        if (query.getPlatform() != null) {
            wrapper.eq(LoginLog::getPlatform, query.getPlatform());
        }
        if (query.getLoginMethod() != null) {
            wrapper.eq(LoginLog::getLoginMethod, query.getLoginMethod());
        }
        if (query.getResult() != null && !query.getResult().isBlank()) {
            wrapper.eq(LoginLog::getResult, query.getResult());
        }
        if (query.getStartDate() != null) {
            wrapper.ge(LoginLog::getCreatedAt, query.getStartDate().atStartOfDay());
        }
        if (query.getEndDate() != null) {
            wrapper.le(LoginLog::getCreatedAt, query.getEndDate().plusDays(1).atStartOfDay());
        }
        wrapper.orderByDesc(LoginLog::getCreatedAt);

        Page<LoginLog> page = new Page<>(query.getPageNum(), query.getPageSize());
        IPage<LoginLog> result = loginLogMapper.selectPage(page, wrapper);
        return result.convert(l -> {
            LoginLogVO vo = new LoginLogVO();
            vo.setId(l.getId());
            vo.setUserId(l.getUserId());
            vo.setUsername(l.getUsername());
            vo.setPlatform(l.getPlatform());
            vo.setLoginMethod(l.getLoginMethod());
            vo.setLoginIp(l.getLoginIp());
            vo.setLoginLocation(l.getLoginLocation());
            vo.setUserAgent(l.getUserAgent());
            vo.setResult(l.getResult());
            vo.setFailReason(l.getFailReason());
            vo.setCreatedAt(l.getCreatedAt());
            return vo;
        });
    }

    private LoginResponse onLoginSuccess(User user, Tenant tenant, LoginRequest req, String remoteIp, String userAgent) {
        resetLoginFailure(user, req.getPlatform(), remoteIp);

        Set<String> roleCodes = loadUserRoleCodes(user.getId());
        Set<String> permissions = permissionService.getUserPermissions(user.getId());
        if (permissions == null) {
            permissions = Collections.emptySet();
        }

        String fingerprintHash = StringUtils.hasText(req.getFingerprint()) ? sha256(req.getFingerprint()) : "";
        String accessToken = jwtService.generateAccessToken(
                user.getId(),
                tenant.getId(),
                req.getPlatform().getValue(),
                roleCodes,
                fingerprintHash);
        String refreshToken = jwtService.generateRefreshToken();
        String accessHash = sha256(accessToken);
        String refreshHash = sha256(refreshToken);

        long accessExpireSec = jwtService.getAccessTokenExpireSeconds();
        long refreshExpireSec = AuthConstants.REFRESH_TOKEN_EXPIRE_SECONDS;
        UserSession session = createSession(user, tenant.getId(), req, remoteIp, userAgent, accessHash, refreshHash,
                accessExpireSec, refreshExpireSec);
        redisTemplate.opsForValue().set(refreshTenantKey(refreshHash), String.valueOf(tenant.getId()),
                refreshExpireSec, TimeUnit.SECONDS);

        recordLoginLog(req, user.getId(), tenant.getId(), "SUCCESS", null, remoteIp, userAgent);
        eventPublisher.publish(
                EventTopics.AUTH_EVENTS,
                LoginEvent.success(
                        tenant.getId(),
                        user.getId(),
                        user.getUsername(),
                        req.getPlatform().getValue(),
                        req.getLoginMethod().getValue(),
                        remoteIp));

        LoginResponse.UserInfo userInfo = new LoginResponse.UserInfo();
        userInfo.setId(user.getId());
        userInfo.setUsername(user.getUsername());
        userInfo.setRealName(user.getRealName());
        userInfo.setAvatarUrl(user.getAvatarUrl());
        userInfo.setPhone(user.getPhone());
        userInfo.setEmail(user.getEmail());
        userInfo.setUserType(user.getUserType());
        userInfo.setTenantSuperAdmin(
                user.getUserType() == UserType.TENANT_USER
                        && userDomainService.isTenantSuperAdmin(user.getId(), tenant.getId()));
        userInfo.setTenantId(tenant.getId());
        userInfo.setTenantName(StringUtils.hasText(tenant.getDisplayName()) ? tenant.getDisplayName() : tenant.getName());
        userInfo.setRoles(roleCodes);
        userInfo.setPermissions(permissions);
        userInfo.setAuthorizedMenuPaths(workspaceMenuAccessService.listCurrentUserAuthorizedMenuPaths());

        LoginResponse resp = new LoginResponse();
        resp.setAccessToken(accessToken);
        resp.setRefreshToken(refreshToken);
        resp.setExpiresIn(accessExpireSec);
        resp.setUser(userInfo);
        resp.setNeedChangePassword(false);
        resp.setSessionId(String.valueOf(session.getId()));
        return resp;
    }

    private UserSession createSession(User user, Long tenantId, LoginRequest req, String remoteIp, String userAgent,
                                      String accessHash, String refreshHash, long accessExpireSec, long refreshExpireSec) {
        UserSession session = new UserSession();
        session.setUserId(user.getId());
        session.setTenantId(tenantId);
        session.setPlatform(req.getPlatform());
        session.setDeviceFingerprint(req.getFingerprint());
        session.setLoginMethod(req.getLoginMethod());
        session.setLoginIp(remoteIp);
        session.setUserAgent(userAgent);
        session.setAccessTokenHash(accessHash);
        session.setRefreshTokenHash(refreshHash);
        session.setAccessExpiresAt(LocalDateTime.ofInstant(
                Instant.now().plusSeconds(accessExpireSec), ZoneId.systemDefault()));
        session.setRefreshExpiresAt(LocalDateTime.ofInstant(
                Instant.now().plusSeconds(refreshExpireSec), ZoneId.systemDefault()));
        session.setLastActiveAt(LocalDateTime.now());
        session.setStatus(SessionStatus.ACTIVE);
        session.setCreatedAt(LocalDateTime.now());
        session.setUpdatedAt(LocalDateTime.now());
        sessionMapper.insert(session);
        return session;
    }

    private void assertUserCanLogin(User user, LoginRequest req, Long tenantId, String remoteIp, String userAgent) {
        if (user.getUserType() == null) {
            log.error("User userType is missing at login: userId={}, tenantId={}", user.getId(), user.getTenantId());
            recordLoginFailure(req, tenantId, user.getUsername(), "USER_TYPE_MISSING", remoteIp, userAgent);
            throw new BizException(ResultCode.INTERNAL_ERROR, "userType is required");
        }
        if (user.getStatus() == UserStatus.DISABLED) {
            recordLoginFailure(req, tenantId, user.getUsername(), "USER_DISABLED", remoteIp, userAgent);
            throw new BizException(ResultCode.AUTH_ACCOUNT_DISABLED);
        }
        if (user.getStatus() == UserStatus.LOCKED) {
            recordLoginFailure(req, tenantId, user.getUsername(), "USER_LOCKED", remoteIp, userAgent);
            throw new BizException(ResultCode.AUTH_ACCOUNT_LOCKED);
        }
    }

    private void onPasswordMismatch(User user, LoginRequest req, Long tenantId, String remoteIp, String userAgent) {
        int failCount = user.getLoginFailCount() == null ? 0 : user.getLoginFailCount();
        failCount++;
        user.setLoginFailCount(failCount);

        if (failCount >= AuthConstants.LOGIN_FAIL_LOCK_COUNT) {
            user.setStatus(UserStatus.LOCKED);
        }
        user.setUpdatedAt(LocalDateTime.now());
        userMapper.updateById(user);

        recordLoginFailure(req, tenantId, user.getUsername(), "BAD_PASSWORD", remoteIp, userAgent);
    }

    private void resetLoginFailure(User user, Platform platform, String remoteIp) {
        user.setLoginFailCount(0);
        user.setStatus(UserStatus.ACTIVE);
        user.setLastLoginAt(LocalDateTime.now());
        user.setLastLoginIp(remoteIp);
        user.setLastLoginPlatform(platform.getValue());
        user.setUpdatedAt(LocalDateTime.now());
        userMapper.updateById(user);
    }

    private void recordLoginFailure(LoginRequest req, Long tenantId, String username, String reason,
                                    String remoteIp, String userAgent) {
        if (tenantId == null) {
            log.warn("Skip login failure log because tenant is unresolved: username={}, reason={}, ip={}",
                    username, reason, remoteIp);
            return;
        }

        LoginLog logEntry = new LoginLog();
        logEntry.setUserId(null);
        logEntry.setTenantId(tenantId);
        logEntry.setUsername(username);
        logEntry.setPlatform(req.getPlatform());
        logEntry.setLoginMethod(req.getLoginMethod());
        logEntry.setLoginIp(remoteIp);
        logEntry.setUserAgent(userAgent);
        logEntry.setDeviceFingerprint(req.getFingerprint());
        logEntry.setResult("FAILED");
        logEntry.setFailReason(reason);
        logEntry.setCreatedAt(LocalDateTime.now());
        loginLogMapper.insert(logEntry);

        eventPublisher.publish(
                EventTopics.AUTH_EVENTS,
                LoginEvent.failed(
                        tenantId,
                        username,
                        req.getPlatform().getValue(),
                        req.getLoginMethod().getValue(),
                        remoteIp,
                        reason));
    }

    private Set<String> loadUserRoleCodes(Long userId) {
        List<String> roleCodes = roleMapper.findActiveRoleCodesByUserId(userId);
        if (roleCodes == null || roleCodes.isEmpty()) {
            return Collections.emptySet();
        }
        return roleCodes.stream()
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
    }

    private Tenant requireLoginTenant(Long tenantId) {
        Tenant tenant = tenantMapper.selectOne(
                new LambdaQueryWrapper<Tenant>()
                        .select(Tenant::getId, Tenant::getCode, Tenant::getName, Tenant::getDisplayName,
                                Tenant::getStatus, Tenant::getDeletedAt)
                        .eq(Tenant::getId, tenantId)
                        .isNull(Tenant::getDeletedAt)
                        .last("LIMIT 1"));
        if (tenant == null) {
            throw new BizException(ResultCode.TENANT_NOT_FOUND);
        }
        if (tenant.getStatus() != TenantStatus.ACTIVE && tenant.getStatus() != TenantStatus.MAINTENANCE) {
            throw new BizException(ResultCode.TENANT_DISABLED);
        }
        return tenant;
    }

    private AdminSessionTarget requireAdminSessionTarget(Long sessionId) {
        if (sessionId == null || sessionId <= 0) {
            throw new BizException(ResultCode.PARAM_ERROR, "sessionId is required");
        }
        User currentUser = userDomainService.requireCurrentUser();
        boolean platformUser = currentUser.getUserType() == UserType.SYSTEM_OPS;
        Long currentTenantId = resolveAdminSessionScopeTenantId(currentUser);
        AdminSessionTarget target = sessionMapper.selectAdminSessionTarget(sessionId, platformUser, currentTenantId);
        if (target == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "admin session not found");
        }
        return target;
    }

    private AdminSessionTarget requireAdminUserTarget(String username) {
        User currentUser = userDomainService.requireCurrentUser();
        boolean platformUser = currentUser.getUserType() == UserType.SYSTEM_OPS;
        Long currentTenantId = resolveAdminSessionScopeTenantId(currentUser);
        AdminSessionTarget target = sessionMapper.selectAdminUserTarget(username, platformUser, currentTenantId);
        if (target == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "admin user not found");
        }
        return target;
    }

    private Long resolveAdminSessionScopeTenantId(User currentUser) {
        if (currentUser.getUserType() == UserType.SYSTEM_OPS) {
            return null;
        }
        Long tenantId = AppContextHolder.getTenantId();
        return tenantId != null ? tenantId : currentUser.getTenantId();
    }

    private User requireUniqueLoginUser(String identifier, LoginRequest req, String remoteIp, String userAgent) {
        List<User> matchedUsers = userMapper.findByIdentifierGlobal(identifier);
        if (matchedUsers.isEmpty()) {
            recordLoginFailure(req, resolveFallbackTenantIdForLoginFailure(), identifier, "USER_NOT_FOUND", remoteIp, userAgent);
            throw new BizException(ResultCode.AUTH_INVALID_CREDENTIALS);
        }
        if (matchedUsers.size() > 1) {
            log.error("Duplicate login identifier detected across tenants: identifier={}, matchedCount={}", identifier, matchedUsers.size());
            throw new BizException(ResultCode.INTERNAL_ERROR, "duplicate login identifier detected");
        }
        return matchedUsers.getFirst();
    }

    private Long resolveFallbackTenantIdForLoginFailure() {
        Tenant defaultTenant = tenantMapper.selectOne(
                new LambdaQueryWrapper<Tenant>()
                        .select(Tenant::getId)
                        .eq(Tenant::getCode, "system-ops")
                        .eq(Tenant::getStatus, TenantStatus.ACTIVE)
                        .isNull(Tenant::getDeletedAt)
                        .last("LIMIT 1"));
        if (defaultTenant != null) {
            return defaultTenant.getId();
        }

        Tenant firstActiveTenant = tenantMapper.selectOne(
                new LambdaQueryWrapper<Tenant>()
                        .select(Tenant::getId)
                        .eq(Tenant::getStatus, TenantStatus.ACTIVE)
                        .isNull(Tenant::getDeletedAt)
                        .orderByAsc(Tenant::getId)
                        .last("LIMIT 1"));
        return firstActiveTenant != null ? firstActiveTenant.getId() : null;
    }

    private String resolveLoginIdentifier(LoginRequest req) {
        if (StringUtils.hasText(req.getUsername())) {
            return req.getUsername().trim();
        }
        if (StringUtils.hasText(req.getPhone())) {
            return req.getPhone().trim();
        }
        if (StringUtils.hasText(req.getEmail())) {
            return req.getEmail().trim();
        }
        return null;
    }

    private String refreshTenantKey(String refreshHash) {
        return REFRESH_TENANT_KEY_PREFIX + refreshHash;
    }

    private <T> T withTenantContext(Long tenantId, Supplier<T> supplier) {
        AppContext previous = AppContextHolder.get();
        AppContext temp = new AppContext();
        temp.setTenantId(tenantId);
        AppContextHolder.set(temp);
        try {
            return supplier.get();
        } finally {
            if (previous != null) {
                AppContextHolder.set(previous);
            } else {
                AppContextHolder.clear();
            }
        }
    }

    private String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "SHA-256 unavailable");
        }
    }
}
