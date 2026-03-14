package com.songhg.firefly.iot.system.dto.user;

import com.songhg.firefly.iot.common.enums.UserStatus;
import com.songhg.firefly.iot.common.enums.UserType;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

@Data
@Schema(description = "用户视图对象")
public class UserVO {

    @Schema(description = "用户编号")
    private Long id;

    @Schema(description = "用户名")
    private String username;

    @Schema(description = "手机号")
    private String phone;

    @Schema(description = "邮箱")
    private String email;

    @Schema(description = "头像地址")
    private String avatarUrl;

    @Schema(description = "真实姓名")
    private String realName;

    @Schema(description = "用户类型")
    private UserType userType;

    @Schema(description = "是否为租户管理员")
    private Boolean tenantSuperAdmin;

    @Schema(description = "状态")
    private UserStatus status;

    @Schema(description = "角色分配")
    private List<UserRoleVO> roles;

    @Schema(description = "最近登录时间")
    private LocalDateTime lastLoginAt;

    @Schema(description = "创建时间")
    private LocalDateTime createdAt;

    @Schema(description = "当前空间已授权菜单路由")
    private Set<String> authorizedMenuPaths;

    @Data
    @Schema(description = "用户角色视图对象")
    public static class UserRoleVO {

        @Schema(description = "角色编号")
        private Long roleId;

        @Schema(description = "角色名称")
        private String roleName;

        @Schema(description = "角色编码")
        private String roleCode;

        @Schema(description = "项目编号")
        private Long projectId;

        @Schema(description = "项目名称")
        private String projectName;
    }
}
