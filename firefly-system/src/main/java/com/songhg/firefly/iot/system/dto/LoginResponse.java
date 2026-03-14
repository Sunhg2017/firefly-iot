package com.songhg.firefly.iot.system.dto;

import com.songhg.firefly.iot.common.enums.UserType;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.Set;

@Data
@Schema(description = "登录响应")
public class LoginResponse {

    @Schema(description = "访问令牌")
    private String accessToken;

    @Schema(description = "刷新令牌")
    private String refreshToken;

    @Schema(description = "令牌过期秒数")
    private long expiresIn;

    @Schema(description = "令牌类型", example = "Bearer")
    private String tokenType = "Bearer";

    @Schema(description = "用户信息")
    private UserInfo user;

    @Schema(description = "是否需要修改密码")
    private boolean needChangePassword;

    @Schema(description = "会话编号")
    private String sessionId;

    @Data
    @Schema(description = "认证用户信息")
    public static class UserInfo {

        @Schema(description = "用户编号")
        private Long id;

        @Schema(description = "用户名")
        private String username;

        @Schema(description = "真实姓名")
        private String realName;

        @Schema(description = "头像地址")
        private String avatarUrl;

        @Schema(description = "手机号")
        private String phone;

        @Schema(description = "邮箱")
        private String email;

        @Schema(description = "用户类型")
        private UserType userType;

        @Schema(description = "是否为租户管理员")
        private boolean tenantSuperAdmin;

        @Schema(description = "租户编号")
        private Long tenantId;

        @Schema(description = "租户名称")
        private String tenantName;

        @Schema(description = "角色编码集合")
        private Set<String> roles;

        @Schema(description = "权限编码集合")
        private Set<String> permissions;

        @Schema(description = "当前空间已授权菜单路由")
        private Set<String> authorizedMenuPaths;
    }
}
