package com.songhg.firefly.iot.system.dto;

import com.songhg.firefly.iot.common.enums.LoginMethod;
import com.songhg.firefly.iot.common.enums.Platform;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Login log view object.
 */
@Data
@Schema(description = "登录日志视图对象")
public class LoginLogVO {

    @Schema(description = "日志编号")
    private Long id;

    @Schema(description = "用户编号")
    private Long userId;

    @Schema(description = "用户名")
    private String username;

    @Schema(description = "平台")
    private Platform platform;

    @Schema(description = "登录方式")
    private LoginMethod loginMethod;

    @Schema(description = "登录网络地址")
    private String loginIp;

    @Schema(description = "登录地点")
    private String loginLocation;

    @Schema(description = "User-Agent")
    private String userAgent;

    @Schema(description = "登录结果")
    private String result;

    @Schema(description = "失败原因")
    private String failReason;

    @Schema(description = "创建时间")
    private LocalDateTime createdAt;
}
