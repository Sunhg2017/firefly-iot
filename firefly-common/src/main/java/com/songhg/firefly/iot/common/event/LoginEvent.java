package com.songhg.firefly.iot.common.event;

import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 登录/登出领域事件。
 * 场景: 登录成功、登录失败、登出、全端登出、会话踢出。
 * 消费方: 审计日志写入、安全告警、在线统计。
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class LoginEvent extends DomainEvent {

    public enum Action { LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, LOGOUT_ALL, SESSION_KICKED }

    private Action action;
    private Long targetUserId;
    private String username;
    private String platform;
    private String loginMethod;
    private String loginIp;
    private String deviceFingerprint;
    private String failReason;
    private Long sessionId;

    public LoginEvent() {
        super();
    }

    public static LoginEvent success(Long tenantId, Long userId, String username,
                                       String platform, String loginMethod, String ip) {
        LoginEvent e = new LoginEvent();
        e.setTenantId(tenantId);
        e.setTargetUserId(userId);
        e.setOperatorId(userId);
        e.setUsername(username);
        e.setPlatform(platform);
        e.setLoginMethod(loginMethod);
        e.setLoginIp(ip);
        e.setAction(Action.LOGIN_SUCCESS);
        e.setSource("firefly-system");
        return e;
    }

    public static LoginEvent failed(Long tenantId, String username, String platform,
                                      String loginMethod, String ip, String reason) {
        LoginEvent e = new LoginEvent();
        e.setTenantId(tenantId);
        e.setUsername(username);
        e.setPlatform(platform);
        e.setLoginMethod(loginMethod);
        e.setLoginIp(ip);
        e.setFailReason(reason);
        e.setAction(Action.LOGIN_FAILED);
        e.setSource("firefly-system");
        return e;
    }

    public static LoginEvent logout(Long tenantId, Long userId, String platform) {
        LoginEvent e = new LoginEvent();
        e.setTenantId(tenantId);
        e.setTargetUserId(userId);
        e.setOperatorId(userId);
        e.setPlatform(platform);
        e.setAction(Action.LOGOUT);
        e.setSource("firefly-system");
        return e;
    }

    public static LoginEvent sessionKicked(Long tenantId, Long userId, Long sessionId, Long operatorId) {
        LoginEvent e = new LoginEvent();
        e.setTenantId(tenantId);
        e.setTargetUserId(userId);
        e.setOperatorId(operatorId);
        e.setSessionId(sessionId);
        e.setAction(Action.SESSION_KICKED);
        e.setSource("firefly-system");
        return e;
    }
}
