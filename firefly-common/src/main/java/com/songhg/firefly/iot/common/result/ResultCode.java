package com.songhg.firefly.iot.common.result;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum ResultCode {

    SUCCESS(0, "success"),

    // 通用错误 1xxx
    BAD_REQUEST(1000, "请求参数错误"),
    PARAM_ERROR(1001, "参数校验失败"),
    UNAUTHORIZED(1002, "未认证"),
    FORBIDDEN(1003, "权限不足"),
    NOT_FOUND(1004, "资源不存在"),
    CONFLICT(1009, "资源冲突"),
    INTERNAL_ERROR(1500, "服务内部错误"),

    // 认证错误 2xxx
    AUTH_INVALID_CREDENTIALS(2001, "用户名或密码错误"),
    AUTH_ACCOUNT_DISABLED(2002, "账号已被禁用"),
    AUTH_ACCOUNT_LOCKED(2003, "账号已锁定"),
    AUTH_TOKEN_EXPIRED(2004, "Token已过期"),
    AUTH_TOKEN_INVALID(2005, "Token无效"),
    AUTH_REFRESH_TOKEN_INVALID(2006, "Refresh Token无效或已过期"),
    AUTH_SMS_RATE_LIMITED(2007, "短信发送过于频繁"),
    AUTH_SMS_CODE_INVALID(2008, "验证码错误或已过期"),
    AUTH_QRCODE_EXPIRED(2009, "二维码已过期"),
    AUTH_OAUTH_FAILED(2010, "第三方登录失败"),
    AUTH_SESSION_LIMIT(2011, "登录设备数已达上限"),
    AUTH_FINGERPRINT_MISMATCH(2012, "设备指纹不匹配"),
    AUTH_PASSWORD_CHANGE_REQUIRED(2013, "需要修改密码"),

    // 租户错误 3xxx
    TENANT_NOT_FOUND(3001, "租户不存在"),
    TENANT_DISABLED(3002, "租户已暂停"),
    TENANT_INIT_FAILED(3003, "租户初始化失败"),
    TENANT_CODE_EXISTS(3004, "租户代码已存在"),

    // 配额错误 4xxx
    QUOTA_EXCEEDED(4001, "配额已达上限"),
    QUOTA_DEVICE_EXCEEDED(4002, "设备数已达上限"),
    QUOTA_USER_EXCEEDED(4003, "用户数已达上限"),
    QUOTA_RULE_EXCEEDED(4004, "规则数已达上限"),
    QUOTA_PROJECT_EXCEEDED(4005, "项目数已达上限"),

    // 用户权限错误 5xxx
    USER_NOT_FOUND(5001, "用户不存在"),
    USER_EXISTS(5002, "用户名已存在"),
    ROLE_NOT_FOUND(5003, "角色不存在"),
    ROLE_CODE_EXISTS(5004, "角色代码已存在"),
    ROLE_IS_SYSTEM(5005, "系统角色不可修改"),
    PERMISSION_DENIED(5006, "无此操作权限"),
    APIKEY_NOT_FOUND(5007, "API Key不存在"),

    // 项目错误 6xxx
    PROJECT_NOT_FOUND(6001, "项目不存在"),
    PROJECT_CODE_EXISTS(6002, "项目代码已存在"),

    // 产品错误 7xxx
    PRODUCT_NOT_FOUND(7001, "产品不存在"),
    PRODUCT_STATUS_ERROR(7002, "产品状态不允许此操作"),
    PRODUCT_HAS_DEVICES(7003, "产品下存在设备，不允许删除"),

    // 设备错误 8xxx
    DEVICE_NOT_FOUND(8001, "设备不存在"),
    DEVICE_NAME_EXISTS(8002, "设备名称已存在"),
    DEVICE_DISABLED(8003, "设备已被禁用"),
    DEVICE_STATUS_ERROR(8004, "设备状态不允许此操作"),

    // 规则引擎错误 9xxx
    RULE_ENGINE_NOT_FOUND(9001, "规则不存在"),

    // 告警错误 10xxx
    ALARM_RULE_NOT_FOUND(10001, "告警规则不存在"),
    ALARM_RECORD_NOT_FOUND(10002, "告警记录不存在"),
    ALARM_STATUS_ERROR(10003, "告警状态不允许此操作"),

    // OTA 错误 11xxx
    FIRMWARE_NOT_FOUND(11001, "固件不存在"),
    FIRMWARE_STATUS_ERROR(11002, "固件状态不允许此操作"),
    FIRMWARE_VERSION_EXISTS(11003, "该产品下已存在此版本号"),
    OTA_TASK_NOT_FOUND(11004, "升级任务不存在"),
    OTA_TASK_STATUS_ERROR(11005, "升级任务状态不允许此操作"),

    // 视频监控错误 12xxx
    VIDEO_DEVICE_NOT_FOUND(12001, "视频设备不存在"),
    VIDEO_DEVICE_OFFLINE(12002, "视频设备离线"),
    VIDEO_CHANNEL_NOT_FOUND(12003, "视频通道不存在"),
    STREAM_START_FAILED(12004, "视频流启动失败"),
    STREAM_NOT_FOUND(12005, "视频流会话不存在"),
    VIDEO_DEVICE_EXISTS(12006, "视频设备已存在");

    private final int code;
    private final String message;
}
