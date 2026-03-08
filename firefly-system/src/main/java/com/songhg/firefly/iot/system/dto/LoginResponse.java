package com.songhg.firefly.iot.system.dto;

import com.songhg.firefly.iot.common.enums.UserType;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.Set;

/**
 * Login response.
 */
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

    /**
     * Authenticated user info.
     */
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

        @Schema(description = "User type")
        private UserType userType;

        @Schema(description = "鏄惁涓虹鎴疯秴绾х鐞嗗憳")
        private boolean tenantSuperAdmin;

        @Schema(description = "鏄惁鍙互绠＄悊褰撳墠宸ヤ綔绌洪棿鑿滃崟")
        private boolean workspaceMenuAdmin;

        @Schema(description = "租户编号")
        private Long tenantId;

        @Schema(description = "租户名称")
        private String tenantName;

        @Schema(description = "角色编码集合")
        private Set<String> roles;

        @Schema(description = "权限编码集合")
        private Set<String> permissions;
    }
}
