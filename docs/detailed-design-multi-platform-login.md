# Firefly-IoT 多平台登录模块 — 详细设计文档

> **版本**: v1.0.0  
> **日期**: 2026-02-25  
> **状态**: Draft  
> **关联**: [产品设计文档](./product-design.md) §12.4 多平台登录体系、§12.3 API 安全

---

## 目录

1. [模块概述](#1-模块概述)
2. [核心概念与术语](#2-核心概念与术语)
3. [统一认证架构](#3-统一认证架构)
4. [数据库设计](#4-数据库设计)
5. [登录方式详细设计](#5-登录方式详细设计)
6. [Token 管理机制](#6-token-管理机制)
7. [会话管理](#7-会话管理)
8. [第三方登录对接](#8-第三方登录对接)
9. [推送通知集成](#9-推送通知集成)
10. [API 接口设计](#10-api-接口设计)
11. [缓存与安全设计](#11-缓存与安全设计)
12. [前端交互设计](#12-前端交互设计)
13. [非功能性需求](#13-非功能性需求)

---

## 1. 模块概述

### 1.1 模块定位

多平台登录模块是 Firefly-IoT 平台的 **统一认证入口**，负责 Web 管理端、iOS/Android APP、微信/支付宝小程序等多端用户的身份认证、会话管理和第三方登录对接。基于 **OAuth 2.0 / OIDC** 标准，结合 **双 Token 机制**，实现安全、无感续签的多端认证体验。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| **多端认证** | Web、iOS APP、Android APP、微信小程序、支付宝小程序统一认证 |
| **多登录方式** | 账号密码、短信验证码、微信/支付宝/钉钉/Apple 登录、扫码登录、SSO/LDAP |
| **双 Token** | Access Token (短效 2h) + Refresh Token (长效 30d)，无感续签 |
| **会话管理** | 多端独立会话、并发控制、强制下线、设备指纹绑定 |
| **第三方账号绑定** | UnionID 关联、多第三方账号绑定/解绑 |
| **推送 Token** | APNs / FCM / 厂商通道推送 Token 注册与维护 |
| **安全防护** | 登录失败锁定、异地登录检测、Token 黑名单、防重放 |

### 1.3 模块依赖关系

```
┌──────────────────────────────────────────────────────────────┐
│                     客户端层                                   │
│  Web Console │ iOS APP │ Android APP │ 微信小程序 │ 支付宝小程序│
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│                Spring Cloud Gateway (Token校验·路由·限流)      │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│               多平台登录模块 (Auth Service)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ 登录认证  │ │ Token    │ │ 会话管理  │ │ 第三方登录适配  │  │
│  │ 引擎     │ │ 管理器   │ │          │ │ (微信/支付宝/  │  │
│  └──────────┘ └──────────┘ └──────────┘ │  Apple/钉钉)   │  │
│  ┌──────────┐ ┌──────────┐ ┌────────────┘────────────────┐  │
│  │ 扫码登录  │ │ SMS验证码 │ │ SSO/LDAP 集成              │  │
│  └──────────┘ └──────────┘ └─────────────────────────────┘  │
└──────────────────────┬───────────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │ 用户权限  │ │ 租户管理  │ │ 推送服务  │
    └──────────┘ └──────────┘ └──────────┘
```

---

## 2. 核心概念与术语

| 术语 | 说明 |
|------|------|
| **Access Token** | 短效访问令牌 (JWT, RS256)，携带用户/租户/角色信息，默认 2h |
| **Refresh Token** | 长效刷新令牌，用于无感续签 Access Token，默认 30d |
| **Platform** | 客户端平台: WEB / APP_IOS / APP_ANDROID / MINI_WECHAT / MINI_ALIPAY |
| **Device Fingerprint** | 客户端设备唯一标识，绑定 Token 防盗用 |
| **Session** | 用户在某个平台上的一次登录状态记录 |
| **UnionID** | 微信生态下跨应用统一用户标识 |
| **OpenID** | 微信生态下单应用内用户标识 |
| **Push Token** | 移动端推送通道标识 (APNs / FCM / 厂商通道) |

---

## 3. 统一认证架构

### 3.1 登录方式与平台矩阵

| 登录方式 | 代码 | WEB | APP_IOS | APP_ANDROID | MINI_WECHAT | MINI_ALIPAY |
|---------|------|:---:|:-------:|:-----------:|:-----------:|:-----------:|
| 账号密码 | `PASSWORD` | ✅ | ✅ | ✅ | ✅ | ✅ |
| 短信验证码 | `SMS` | ✅ | ✅ | ✅ | ✅ | ✅ |
| 微信登录 | `WECHAT` | ✅(扫码) | ✅(SDK) | ✅(SDK) | ✅(wx.login) | ❌ |
| 支付宝登录 | `ALIPAY` | ❌ | ✅(SDK) | ✅(SDK) | ❌ | ✅ |
| 钉钉登录 | `DINGTALK` | ✅(扫码) | ✅(SDK) | ✅(SDK) | ❌ | ❌ |
| Apple 登录 | `APPLE` | ❌ | ✅(iOS) | ❌ | ❌ | ❌ |
| SSO/LDAP | `SSO` | ✅ | ✅ | ✅ | ❌ | ❌ |
| 扫码登录 | `QRCODE` | ✅(被扫端) | ❌(扫码端) | ❌(扫码端) | ❌(扫码端) | ❌ |

### 3.2 认证通用时序

```
客户端                   Gateway              Auth Service           DB/Redis
  │  POST /auth/login      │                      │                     │
  │  {loginMethod,platform, │                      │                     │
  │   credentials,fingerprint}                     │                     │
  │ ──────────────────────►│ ────────────────────►│                     │
  │                        │                      │  验证凭证 ──────────►│
  │                        │                      │  ◄── 用户信息 ────── │
  │                        │                      │  检查状态/锁定       │
  │                        │                      │  检查并发会话限制     │
  │                        │                      │  签发Token+创建Session│
  │                        │                      │  记录登录日志+异地检测 │
  │  ◄── {accessToken,     │ ◄── Token+用户信息 ── │                     │
  │   refreshToken,user} ──│                      │                     │
```

---

## 4. 数据库设计

### 4.1 ER 图

```
┌──────────────────────┐
│      users (共享)     │──────┐
├──────────────────────┤      │
│ id, tenant_id,       │      │
│ username,            │      │
│ password_hash,       │      │
│ phone, email,        │      │
│ status,              │      │
│ login_fail_count,    │      │
│ lock_until,          │      │
│ last_login_at/ip     │      │
└──────────────────────┘      │
       ┌──────────────────────┤
       ▼                      ▼
┌──────────────────┐  ┌──────────────────────┐
│ user_sessions    │  │ user_oauth_bindings  │
├──────────────────┤  ├──────────────────────┤
│ id (PK)          │  │ id (PK)              │
│ user_id (FK)     │  │ user_id (FK)         │
│ tenant_id        │  │ provider (WECHAT/    │
│ platform         │  │  ALIPAY/APPLE/       │
│ device_fingerprint│  │  DINGTALK)           │
│ device_name      │  │ open_id, union_id    │
│ login_method     │  │ app_id               │
│ login_ip         │  │ nickname, avatar_url │
│ login_location   │  │ raw_data (JSONB)     │
│ access_token_hash│  │ UK(provider,open_id, │
│ refresh_token_hash│ │   app_id)            │
│ push_token       │  └──────────────────────┘
│ push_channel     │
│ access_expires_at│  ┌──────────────────────┐
│ refresh_expires_at│ │ login_logs           │
│ last_active_at   │  ├──────────────────────┤
│ status (ACTIVE/  │  │ id, user_id,         │
│  EXPIRED/KICKED/ │  │ tenant_id, platform, │
│  LOGOUT)         │  │ login_method,        │
└──────────────────┘  │ login_ip, location,  │
                      │ result, fail_reason, │
┌──────────────────┐  │ created_at           │
│ token_blacklist  │  └──────────────────────┘
├──────────────────┤
│ token_hash (PK)  │  ┌──────────────────────┐
│ user_id, type,   │  │ sms_verify_codes     │
│ reason, expires_at│ ├──────────────────────┤
└──────────────────┘  │ id, phone, code,     │
                      │ purpose, verified,   │
┌──────────────────┐  │ verify_count,        │
│qrcode_login_tickets││ expires_at           │
├──────────────────┤  └──────────────────────┘
│ id (PK, UUID)    │
│ status (PENDING/ │
│  SCANNED/CONFIRMED│
│  /EXPIRED)       │
│ scanned_user_id  │
│ expires_at       │
└──────────────────┘
```

### 4.2 核心 DDL

```sql
CREATE TABLE user_sessions (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id           BIGINT NOT NULL,
    platform            VARCHAR(32) NOT NULL,
    device_fingerprint  VARCHAR(256),
    device_name         VARCHAR(128),
    device_model        VARCHAR(128),
    os_version          VARCHAR(64),
    app_version         VARCHAR(32),
    login_method        VARCHAR(32) NOT NULL,
    login_ip            VARCHAR(45),
    login_location      VARCHAR(256),
    user_agent          VARCHAR(512),
    access_token_hash   VARCHAR(256) NOT NULL,
    refresh_token_hash  VARCHAR(256) NOT NULL,
    push_token          VARCHAR(512),
    push_channel        VARCHAR(32),  -- APNS/FCM/HUAWEI/XIAOMI/OPPO/VIVO
    access_expires_at   TIMESTAMPTZ NOT NULL,
    refresh_expires_at  TIMESTAMPTZ NOT NULL,
    last_active_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    status              VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_session_user ON user_sessions(user_id, status);
CREATE INDEX idx_session_platform ON user_sessions(user_id, platform, status);

CREATE TABLE user_oauth_bindings (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id   BIGINT NOT NULL,
    provider    VARCHAR(32) NOT NULL,
    open_id     VARCHAR(256) NOT NULL,
    union_id    VARCHAR(256),
    app_id      VARCHAR(128) NOT NULL,
    nickname    VARCHAR(256),
    avatar_url  VARCHAR(512),
    raw_data    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_oauth_provider_openid UNIQUE (provider, open_id, app_id)
);
CREATE INDEX idx_oauth_user ON user_oauth_bindings(user_id);
CREATE INDEX idx_oauth_union ON user_oauth_bindings(provider, union_id);

CREATE TABLE token_blacklist (
    token_hash  VARCHAR(256) PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    type        VARCHAR(16) NOT NULL,   -- ACCESS / REFRESH
    reason      VARCHAR(32) NOT NULL,    -- LOGOUT / KICK / PWD_CHANGE / REVOKE
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE login_logs (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT,
    tenant_id           BIGINT,
    username            VARCHAR(128),
    platform            VARCHAR(32),
    login_method        VARCHAR(32),
    login_ip            VARCHAR(45),
    login_location      VARCHAR(256),
    user_agent          VARCHAR(512),
    device_fingerprint  VARCHAR(256),
    result              VARCHAR(32) NOT NULL,
    fail_reason         VARCHAR(512),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_log_user ON login_logs(user_id, created_at DESC);

CREATE TABLE sms_verify_codes (
    id          BIGSERIAL PRIMARY KEY,
    phone       VARCHAR(32) NOT NULL,
    code        VARCHAR(8) NOT NULL,
    purpose     VARCHAR(32) NOT NULL,
    ip_address  VARCHAR(45),
    verified    BOOLEAN NOT NULL DEFAULT FALSE,
    verify_count INT NOT NULL DEFAULT 0,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE qrcode_login_tickets (
    id              VARCHAR(64) PRIMARY KEY,
    status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    scanned_user_id BIGINT,
    scanned_platform VARCHAR(32),
    confirm_token   VARCHAR(256),
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 5. 登录方式详细设计

### 5.1 账号密码登录

```java
public AuthResult passwordLogin(PasswordLoginRequest req) {
    // 1. 查找用户 (支持用户名/手机号/邮箱)
    User user = userRepository.findByUsernameOrPhoneOrEmail(req.getUsername());
    if (user == null) {
        recordLoginLog(req, null, LoginResult.FAIL_NOT_FOUND);
        throw new AuthException("用户名或密码错误"); // 不暴露具体原因
    }
    // 2. 状态检查
    if (user.getStatus() != UserStatus.ACTIVE)
        throw new AuthException("账号已被禁用");
    // 3. 锁定检查
    if (user.getLockUntil() != null && user.getLockUntil().isAfter(Instant.now()))
        throw new AuthException("账号已锁定，请稍后重试");
    // 4. 密码验证 (BCrypt)
    if (!passwordEncoder.matches(req.getPassword(), user.getPasswordHash())) {
        int failCount = user.getLoginFailCount() + 1;
        if (failCount >= 5) user.setLockUntil(Instant.now().plusMinutes(30));
        user.setLoginFailCount(failCount);
        userRepository.save(user);
        throw new AuthException("用户名或密码错误，还剩 " + (5-failCount) + " 次");
    }
    // 5. 重置失败计数，签发Token+创建Session
    user.setLoginFailCount(0);
    user.setLockUntil(null);
    return issueTokenAndCreateSession(user, req.getPlatform(),
        LoginMethod.PASSWORD, req.getFingerprint());
}
```

### 5.2 短信验证码登录

**发送流程:** 客户端 `POST /api/v1/auth/sms/send` → 频率限制检查 → 生成6位随机码存入Redis(5min TTL) → 调用短信网关发送

**验证流程:** 客户端 `POST /api/v1/auth/sms/login` → 校验验证码(Redis) → 查找用户(by phone) → 不存在可自动注册(APP/小程序场景) → 签发Token

**短信安全策略:**

| 策略 | 规则 |
|------|------|
| 发送频率 | 同一手机号 60s 内仅一条 |
| 每日上限 | 同一手机号每日最多 10 条 |
| IP 限制 | 同一 IP 每小时最多 20 条 |
| 验证次数 | 同一验证码最多尝试 5 次 |
| 有效期 | 5 分钟，验证成功后立即作废 |

### 5.3 扫码登录

```
Web端                  Auth Service         Redis          APP/小程序
 │ GET /auth/qrcode      │                    │                │
 │ ─────────────────────►│ 生成qrcodeId       │                │
 │                        │ 存入Redis(5min) ──►│                │
 │ ◄─ {qrcodeId,url} ────│                    │                │
 │                        │                    │                │
 │ WS /auth/qrcode/{id}  │                    │  (用户扫码)     │
 │  /status              │                    │ ◄───────────── │
 │ ═══(WebSocket)═══════►│                    │                │
 │                        │  POST /auth/qrcode/{id}/scan       │
 │                        │ ◄─────────────────────────────────│
 │                        │ 更新→SCANNED ─────►│                │
 │ ◄═(WS:SCANNED)════════│                    │                │
 │                        │                    │  (用户确认)     │
 │                        │  POST /auth/qrcode/{id}/confirm    │
 │                        │ ◄─────────────────────────────────│
 │                        │ 签发Token(Web端)   │                │
 │ ◄═(WS:CONFIRMED,      │                    │                │
 │   accessToken)═════════│                    │                │
```

**状态机:** `PENDING →(扫码)→ SCANNED →(确认)→ CONFIRMED` / `→(超时5min)→ EXPIRED`

### 5.4 SSO/LDAP 登录

客户端 `POST /api/v1/auth/sso` → Auth Service 执行 LDAP Bind 认证 → 查询 LDAP 属性(邮箱/部门/姓名) → 查找/同步本地用户(JIT Provisioning, 不存在自动创建) → 签发 Token

SSO/LDAP 配置按租户独立存储，支持 LDAP URL、BaseDN、属性映射、自动创建用户、默认角色等配置项。

---

## 6. Token 管理机制

### 6.1 双 Token 机制

| Token | 类型 | 有效期 | 存储 | 用途 |
|-------|------|-------|------|------|
| **Access Token** | JWT (RS256) | 2h (可配) | 客户端内存 | API 请求认证 |
| **Refresh Token** | 不透明随机串 | 30d (可配) | Redis + DB | 续签 Access Token |

### 6.2 Access Token (JWT) Payload

```json
{
  "sub": "1001",          // userId
  "tid": "t_001",         // tenantId
  "iss": "firefly-iot-auth",
  "iat": 1740412800,
  "exp": 1740420000,
  "jti": "uuid-v7",       // 唯一标识(用于黑名单)
  "platform": "WEB",
  "roles": ["DEVELOPER"],
  "permissions_hash": "sha256:abc123",
  "fingerprint_hash": "sha256:fp_hash"
}
```

### 6.3 Token 续签流程

```
Access Token 过期 → 客户端收到 401
  → POST /api/v1/auth/refresh {"refreshToken":"rt_xxx"}
  → 服务端: 验证 Refresh Token(Redis) → 检查未过期 → 签发新 Access Token
  → (可选) 轮换 Refresh Token (rotation)
  → 返回新 Token 对
```

### 6.4 Token 黑名单 (Redis)

```
# 单个Token黑名单
token:blacklist:{SHA256(token)}  → value: reason, TTL: Token剩余有效期

# 用户维度全量撤销 (修改密码/管理员全部踢出)
token:revoke_before:{userId}     → value: timestamp, TTL: Max Token有效期
  → 所有 iat < timestamp 的 Token 均无效

Gateway校验: 解析JWT → 检查黑名单 → 检查revoke_before → 通过则注入用户上下文
```

### 6.5 Token 配置

```yaml
auth:
  jwt:
    algorithm: RS256
    key-rotation-days: 90
  access-token:
    expire-seconds: 7200        # 2h
  refresh-token:
    expire-seconds: 2592000     # 30d
    rotation-enabled: true
  session:
    max-concurrent:
      WEB: 3
      APP_IOS: 2
      APP_ANDROID: 2
      MINI_WECHAT: 2
      MINI_ALIPAY: 2
    kick-strategy: KICK_OLDEST  # 超限时踢掉最早会话
```

---

## 7. 会话管理

### 7.1 多端并发控制

每个平台独立计数。超限策略:
- **KICK_OLDEST**: 踢掉最早的会话 (默认)
- **DENY_NEW**: 拒绝新登录
- **KICK_ALL**: 踢出该平台所有旧会话

### 7.2 强制下线

管理员 `DELETE /api/v1/user/sessions/{sessionId}` 或 `POST /api/v1/users/{userId}/kick`
→ 更新 Session 状态→KICKED → Access Token + Refresh Token 加入黑名单 → WebSocket/推送通知客户端 → 记录审计日志

### 7.3 Session 活跃度

- 每次 API 请求: Gateway 异步更新 Redis `session:active:{sessionId}`
- 定时任务(每10min): 批量同步到 DB `last_active_at`
- 定时清理过期 Session

### 7.4 设备指纹校验

客户端生成指纹(Web: canvas+webgl哈希; APP: IDFV/AndroidID+设备型号; 小程序: 系统信息)
→ JWT payload 包含 `fingerprint_hash`
→ 每次请求携带 `X-Device-Fingerprint` Header
→ Gateway 比对哈希，不匹配则拒绝+安全告警

---

## 8. 第三方登录对接

### 8.1 微信小程序登录

```
小程序 wx.login()→code → POST /api/v1/auth/wechat-mini {code, encryptedData, iv}
  → Auth Service: code2Session(appId+appSecret+code) → 微信服务器返回 openId/unionId
  → 解密用户信息(AES) → 查找OAuth绑定 → 已绑定直接登录 / 未绑定通过UnionID关联或自动注册
  → 签发 Token
```

### 8.2 APP 微信登录

```
APP 微信SDK授权→code → POST /api/v1/auth/wechat {code, platform}
  → Auth Service: 获取access_token+openId(微信开放平台)
  → 获取用户信息(unionId,nickname) → 查找绑定/UnionID关联/自动注册 → 签发 Token
```

### 8.3 支付宝登录

```
APP/小程序 → auth_code → POST /api/v1/auth/alipay {authCode}
  → alipay.system.oauth.token(获取userId) → alipay.user.info.share(获取用户信息)
  → 查找绑定/自动注册 → 签发 Token
```

### 8.4 Apple 登录

```
iOS Sign in with Apple → identityToken(JWT) + authorizationCode
  → POST /api/v1/auth/apple {identityToken, authorizationCode, user}
  → 获取Apple JWKS公钥 → 验证identityToken(RS256) → 获取sub(Apple User ID)
  → 查找绑定/自动注册 → 签发 Token
```

### 8.5 钉钉登录

```
Web扫码/APP SDK → code → POST /api/v1/auth/dingtalk {code}
  → 获取access_token → 获取用户信息(unionId,name) → 查找绑定/自动注册 → 签发 Token
```

### 8.6 第三方登录适配器

```java
public interface OAuthProvider {
    String providerId();  // WECHAT / ALIPAY / APPLE / DINGTALK
    OAuthUserInfo authenticate(OAuthRequest request);
}

@Data
public class OAuthUserInfo {
    private String openId;
    private String unionId;
    private String nickname;
    private String avatarUrl;
    private String email;
    private Map<String, Object> rawData;
}
```

### 8.7 账号绑定/解绑

- **绑定**: `POST /api/v1/user/oauth-bindings` → 获取第三方信息 → 检查openId未被他人绑定 → 创建绑定
- **解绑**: `DELETE /api/v1/user/oauth-bindings/{id}` → 检查至少保留一种登录方式 → 删除绑定
- **查询**: `GET /api/v1/user/oauth-bindings`

---

## 9. 推送通知集成

### 9.1 推送通道

| 平台 | 通道 | 说明 |
|------|------|------|
| iOS | APNs | Apple Push Notification service |
| Android(海外) | FCM | Firebase Cloud Messaging |
| Android(华为) | HMS Push | 华为推送 |
| Android(小米) | MiPush | 小米推送 |
| Android(OPPO) | OPPO Push | OPPO推送 |
| Android(vivo) | vivo Push | vivo推送 |
| 微信小程序 | 订阅消息 | 需用户主动订阅 |
| Web | WebSocket/SSE | 实时长连接 |

### 9.2 Push Token 注册

APP登录/启动后: `PUT /api/v1/user/push-token {pushToken, pushChannel, deviceModel}`
→ 更新当前Session的push_token → 清除该pushToken在其他Session中的关联

---

## 10. API 接口设计

### 10.1 认证 API

| 接口 | 方法 | 说明 | 认证 |
|------|------|------|------|
| `/api/v1/auth/login` | POST | 账号密码登录 | 无 |
| `/api/v1/auth/sms/send` | POST | 发送短信验证码 | 无 |
| `/api/v1/auth/sms/login` | POST | 短信验证码登录 | 无 |
| `/api/v1/auth/wechat-mini` | POST | 微信小程序登录 | 无 |
| `/api/v1/auth/wechat` | POST | 微信APP/Web登录 | 无 |
| `/api/v1/auth/alipay` | POST | 支付宝登录 | 无 |
| `/api/v1/auth/apple` | POST | Apple登录 | 无 |
| `/api/v1/auth/dingtalk` | POST | 钉钉登录 | 无 |
| `/api/v1/auth/sso` | POST | SSO/LDAP登录 | 无 |
| `/api/v1/auth/qrcode` | GET | 生成扫码二维码 | 无 |
| `/api/v1/auth/qrcode/{id}/status` | WS | 监听扫码状态 | 无 |
| `/api/v1/auth/qrcode/{id}/scan` | POST | 扫码 | 需登录 |
| `/api/v1/auth/qrcode/{id}/confirm` | POST | 确认扫码 | 需登录 |
| `/api/v1/auth/refresh` | POST | 刷新Token | Refresh Token |
| `/api/v1/auth/logout` | POST | 登出当前平台 | 需登录 |
| `/api/v1/auth/logout-all` | POST | 登出所有平台 | 需登录 |

### 10.2 会话与绑定 API

| 接口 | 方法 | 说明 | 认证 |
|------|------|------|------|
| `/api/v1/user/sessions` | GET | 查询当前用户所有会话 | 需登录 |
| `/api/v1/user/sessions/{id}` | DELETE | 踢下线指定会话 | 需登录 |
| `/api/v1/user/push-token` | PUT | 上报推送Token | 需登录 |
| `/api/v1/user/oauth-bindings` | GET | 第三方绑定列表 | 需登录 |
| `/api/v1/user/oauth-bindings` | POST | 绑定第三方账号 | 需登录 |
| `/api/v1/user/oauth-bindings/{id}` | DELETE | 解绑第三方账号 | 需登录 |
| `/api/v1/users/{userId}/sessions` | GET | 管理员查询用户会话 | `user:read` |
| `/api/v1/users/{userId}/kick` | POST | 管理员强制踢出 | `user:update` |
| `/api/v1/login-logs` | GET | 登录日志查询 | `audit:read` |

### 10.3 请求/响应示例

**账号密码登录:**

```http
POST /api/v1/auth/login
{"loginMethod":"PASSWORD","platform":"WEB","username":"zhangsan","password":"Abc@123456","fingerprint":"fp_xxx"}
```

```json
{
  "code": 0,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "rt_xxx",
    "expiresIn": 7200,
    "tokenType": "Bearer",
    "user": {
      "id": 1001, "username": "zhangsan", "realName": "张三",
      "tenantId": "t_001", "tenantName": "ACME物联科技",
      "roles": ["DEVELOPER"], "permissions": ["device:*","product:*","rule:*"]
    },
    "needChangePassword": false,
    "sessionId": "sess_abc123"
  }
}
```

**查询会话列表:**

```json
{
  "code": 0,
  "data": [
    {"id":"sess_abc","platform":"WEB","deviceName":"Chrome 120 on Windows",
     "loginMethod":"PASSWORD","loginIp":"10.0.1.55","loginLocation":"上海市",
     "isCurrent":true,"lastActiveAt":"2026-02-25T10:30:00Z"},
    {"id":"sess_def","platform":"APP_IOS","deviceName":"iPhone 15 Pro",
     "loginMethod":"WECHAT","loginIp":"10.0.2.88","loginLocation":"上海市",
     "isCurrent":false,"lastActiveAt":"2026-02-25T09:45:00Z"}
  ]
}
```

---

## 11. 缓存与安全设计

### 11.1 缓存结构

| Key | 内容 | TTL |
|-----|------|-----|
| `session:{sessionId}` | 会话完整信息 | 同 Refresh Token |
| `session:user:{userId}:{platform}` | 会话ID列表 | 同上 |
| `token:blacklist:{tokenHash}` | 黑名单标记 | Token剩余有效期 |
| `token:revoke_before:{userId}` | 全量撤销时间戳 | Max Token有效期 |
| `sms:code:{phone}:{purpose}` | 验证码 | 5 min |
| `sms:rate:{phone}` | 发送频率限制 | 60 s |
| `qrcode:{qrcodeId}` | 扫码票据 | 5 min |

### 11.2 安全防护

| 威胁 | 防护 |
|------|------|
| 暴力破解 | 5次失败锁定30min + 图形验证码 |
| 撞库攻击 | 统一返回"用户名或密码错误" |
| Token盗用 | 设备指纹绑定 + IP变化检测 + 黑名单 |
| Refresh Token泄露 | 使用即轮换(Rotation) + 绑定会话 |
| 重放攻击 | JWT jti唯一标识 + 时间戳校验 |
| CSRF | 登录接口不依赖Cookie; OAuth state参数 |
| 短信暴力 | 频率限制 + 验证次数限制 + 图形验证码前置 |
| XSS Token泄露 | 推荐httpOnly Cookie或内存存储 |

### 11.3 异地登录检测

每次登录成功后: 获取上次登录记录 → IP地理位置解析 → 非同城则发送安全通知(邮件/短信/APP推送)

### 11.4 OAuth 安全

- state 参数防 CSRF，回调时严格校验
- 授权 code 一次性使用
- AppSecret 加密存储，仅服务端使用
- 移动端推荐 PKCE 扩展
- Redirect URI 白名单严格校验

---

## 12. 前端交互设计

### 12.1 Web 登录页

```
┌────────────────────────────────────────────┐
│            Firefly-IoT 物联网平台            │
│                                            │
│  [账号密码] [短信登录]                       │
│                                            │
│  账号: [用户名/手机号/邮箱_________]        │
│  密码: [********************____]          │
│  ☐ 7天内免登录            [忘记密码?]       │
│                                            │
│         [       登  录       ]             │
│                                            │
│  ─────── 其他登录方式 ───────               │
│     🟢微信    📧钉钉    🏢SSO              │
└────────────────────────────────────────────┘
```

### 12.2 会话管理页

显示当前用户所有活跃会话：平台图标、设备名、登录方式、IP/位置、最后活跃时间、当前设备标记、下线按钮、"登出所有设备"按钮。

### 12.3 第三方账号绑定页

列表展示已绑定/未绑定的第三方账号(微信/支付宝/钉钉/Apple)，支持绑定/解绑操作，提示"至少保留一种登录方式"。

---

## 13. 非功能性需求

### 13.1 性能要求

| 指标 | 要求 |
|------|------|
| 登录响应 | ≤ 500 ms (P99) |
| Token 校验(Gateway) | ≤ 3 ms (本地JWT验证 + Redis黑名单) |
| Token 续签 | ≤ 200 ms |
| 短信发送 | ≤ 3 s (含第三方网关) |

### 13.2 可扩展性

- 第三方登录适配器 SPI 化，新增 Provider 只需实现 `OAuthProvider` 接口
- 登录方式可按租户配置启用/禁用
- Token 有效期可按租户/角色配置

### 13.3 监控指标

| 指标 | 说明 |
|------|------|
| `auth_login_total{method,platform,result}` | 登录次数 |
| `auth_login_duration_seconds` | 登录耗时 |
| `auth_token_refresh_total` | Token 续签次数 |
| `auth_session_active{platform}` | 活跃会话数 |
| `auth_sms_send_total{result}` | 短信发送次数 |
| `auth_oauth_total{provider,result}` | 第三方登录次数 |
| `auth_blacklist_check_duration` | 黑名单检查耗时 |

---

> **文档维护**: 本文档随项目迭代持续更新，最新版本请以仓库 `docs/detailed-design-multi-platform-login.md` 为准。
