package com.songhg.firefly.iot.common.constant;

public final class AuthConstants {

    private AuthConstants() {
    }

    // Header keys
    public static final String HEADER_TENANT_ID = "X-Tenant-Id";
    public static final String HEADER_USER_ID = "X-User-Id";
    public static final String HEADER_USERNAME = "X-Username";
    public static final String HEADER_PLATFORM = "X-Platform";
    public static final String HEADER_DEVICE_FINGERPRINT = "X-Device-Fingerprint";
    public static final String HEADER_AUTHORIZATION = "Authorization";
    public static final String HEADER_APP_KEY = "X-App-Key";
    public static final String HEADER_APP_TIMESTAMP = "X-Timestamp";
    public static final String HEADER_APP_NONCE = "X-Nonce";
    public static final String HEADER_APP_SIGNATURE = "X-Signature";
    public static final String HEADER_APP_KEY_ID = "X-App-Key-Id";
    public static final String HEADER_OPEN_API_CODE = "X-Open-Api-Code";
    public static final String HEADER_GRANTED_PERMISSIONS = "X-Granted-Permissions";
    public static final String TOKEN_PREFIX = "Bearer ";

    // Token types
    public static final String TOKEN_TYPE_ACCESS = "ACCESS";
    public static final String TOKEN_TYPE_REFRESH = "REFRESH";

    // Redis key prefixes
    public static final String REDIS_TOKEN_BLACKLIST = "token:blacklist:";
    public static final String REDIS_TOKEN_REVOKE_BEFORE = "token:revoke_before:";
    public static final String REDIS_SESSION = "session:";
    public static final String REDIS_SESSION_USER = "session:user:";
    public static final String REDIS_SMS_CODE = "sms:code:";
    public static final String REDIS_SMS_RATE = "sms:rate:";
    public static final String REDIS_SMS_DAILY = "sms:daily:";
    public static final String REDIS_QRCODE = "qrcode:";
    public static final String REDIS_PERM_USER = "perm:user:";
    public static final String REDIS_PERM_ROLE = "perm:role:";
    public static final String REDIS_OPEN_API_NONCE = "openapi:nonce:";
    public static final String REDIS_TENANT_CTX = "tenant:ctx:";

    // JWT claim keys
    public static final String JWT_CLAIM_TENANT_ID = "tid";
    public static final String JWT_CLAIM_PLATFORM = "platform";
    public static final String JWT_CLAIM_ROLES = "roles";
    public static final String JWT_CLAIM_FINGERPRINT_HASH = "fingerprint_hash";

    // Platforms
    public static final String PLATFORM_WEB = "WEB";
    public static final String PLATFORM_APP_IOS = "APP_IOS";
    public static final String PLATFORM_APP_ANDROID = "APP_ANDROID";
    public static final String PLATFORM_MINI_WECHAT = "MINI_WECHAT";
    public static final String PLATFORM_MINI_ALIPAY = "MINI_ALIPAY";
    public static final String PLATFORM_OPEN_API = "OPEN_API";

    // Login methods
    public static final String LOGIN_METHOD_PASSWORD = "PASSWORD";
    public static final String LOGIN_METHOD_SMS = "SMS";
    public static final String LOGIN_METHOD_WECHAT = "WECHAT";
    public static final String LOGIN_METHOD_WECHAT_MINI = "WECHAT_MINI";
    public static final String LOGIN_METHOD_ALIPAY = "ALIPAY";
    public static final String LOGIN_METHOD_APPLE = "APPLE";
    public static final String LOGIN_METHOD_DINGTALK = "DINGTALK";
    public static final String LOGIN_METHOD_SSO = "SSO";
    public static final String LOGIN_METHOD_QRCODE = "QRCODE";

    // Default token expiration
    public static final long ACCESS_TOKEN_EXPIRE_SECONDS = 7200;       // 2h
    public static final long REFRESH_TOKEN_EXPIRE_SECONDS = 2592000;   // 30d

    // Session limits per platform
    public static final int SESSION_LIMIT_WEB = 3;
    public static final int SESSION_LIMIT_APP = 2;
    public static final int SESSION_LIMIT_MINI = 2;

    // Password policy
    public static final int PASSWORD_MIN_LENGTH = 8;
    public static final int PASSWORD_HISTORY_COUNT = 5;
    public static final int LOGIN_FAIL_LOCK_COUNT = 5;
    public static final int LOGIN_FAIL_LOCK_MINUTES = 30;

    // SMS policy
    public static final int SMS_CODE_LENGTH = 6;
    public static final int SMS_CODE_EXPIRE_SECONDS = 300;   // 5 min
    public static final int SMS_RATE_LIMIT_SECONDS = 60;
    public static final int SMS_DAILY_LIMIT = 10;
    public static final int SMS_VERIFY_MAX_ATTEMPTS = 5;
}
