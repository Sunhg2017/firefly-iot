package com.songhg.firefly.iot.system.dto;

import com.songhg.firefly.iot.common.enums.LoginMethod;
import com.songhg.firefly.iot.common.enums.Platform;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Login request.
 */
@Data
@Schema(description = "登录请求")
public class LoginRequest {

    @Schema(description = "用户名")
    private String username;

    @Schema(description = "手机号")
    private String phone;

    @Schema(description = "邮箱")
    private String email;

    @Schema(description = "登录方式")
    @NotNull(message = "登录方式不能为空")
    private LoginMethod loginMethod;

    @Schema(description = "密码")
    private String password;

    @Schema(description = "短信验证码")
    private String smsCode;

    @Schema(description = "客户端平台")
    @NotNull(message = "平台标识不能为空")
    private Platform platform;

    @Schema(description = "设备指纹")
    private String fingerprint;
}
