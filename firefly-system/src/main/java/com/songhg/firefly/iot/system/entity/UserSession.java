package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.LoginMethod;
import com.songhg.firefly.iot.common.enums.Platform;
import com.songhg.firefly.iot.common.enums.SessionStatus;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("user_sessions")
public class UserSession implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long tenantId;
    private Platform platform;
    private String deviceFingerprint;
    private String deviceName;
    private String deviceModel;
    private String osVersion;
    private String appVersion;
    private LoginMethod loginMethod;
    private String loginIp;
    private String loginLocation;
    private String userAgent;
    private String accessTokenHash;
    private String refreshTokenHash;
    private String pushToken;
    private String pushChannel;
    private LocalDateTime accessExpiresAt;
    private LocalDateTime refreshExpiresAt;
    private LocalDateTime lastActiveAt;
    private SessionStatus status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
