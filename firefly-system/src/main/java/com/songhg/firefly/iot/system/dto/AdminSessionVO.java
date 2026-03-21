package com.songhg.firefly.iot.system.dto;

import com.songhg.firefly.iot.common.enums.LoginMethod;
import com.songhg.firefly.iot.common.enums.Platform;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "管理员会话视图对象")
public class AdminSessionVO {

    @Schema(description = "会话编号")
    private Long id;

    @Schema(description = "管理员账号")
    private String username;

    @Schema(description = "管理员姓名")
    private String realName;

    @Schema(description = "所属租户名称")
    private String tenantName;

    @Schema(description = "管理员身份（SYSTEM_OPS/TENANT_SUPER_ADMIN）")
    private String adminType;

    @Schema(description = "平台")
    private Platform platform;

    @Schema(description = "登录方式")
    private LoginMethod loginMethod;

    @Schema(description = "登录 IP")
    private String loginIp;

    @Schema(description = "客户端标识")
    private String userAgent;

    @Schema(description = "最后活跃时间")
    private LocalDateTime lastActiveAt;

    @Schema(description = "登录时间")
    private LocalDateTime createdAt;
}
