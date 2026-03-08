package com.songhg.firefly.iot.system.dto;

import com.songhg.firefly.iot.common.enums.LoginMethod;
import com.songhg.firefly.iot.common.enums.Platform;
import com.songhg.firefly.iot.common.enums.SessionStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * User session view object.
 */
@Data
@Schema(description = "用户会话视图对象")
public class UserSessionVO {

    @Schema(description = "会话编号")
    private Long id;

    @Schema(description = "平台")
    private Platform platform;

    @Schema(description = "设备名称")
    private String deviceName;

    @Schema(description = "设备型号")
    private String deviceModel;

    @Schema(description = "系统版本")
    private String osVersion;

    @Schema(description = "应用版本")
    private String appVersion;

    @Schema(description = "登录方式")
    private LoginMethod loginMethod;

    @Schema(description = "登录网络地址")
    private String loginIp;

    @Schema(description = "登录地点")
    private String loginLocation;

    @Schema(description = "客户端标识")
    private String userAgent;

    @Schema(description = "会话状态")
    private SessionStatus status;

    @Schema(description = "最近活跃时间")
    private LocalDateTime lastActiveAt;

    @Schema(description = "会话创建时间")
    private LocalDateTime createdAt;
}
