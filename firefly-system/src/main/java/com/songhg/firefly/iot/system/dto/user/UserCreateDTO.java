package com.songhg.firefly.iot.system.dto.user;

import com.songhg.firefly.iot.common.enums.UserType;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * User creation request.
 */
@Data
@Schema(description = "User creation request")
public class UserCreateDTO {

    @Schema(description = "Username", example = "john_doe")
    @NotBlank(message = "用户名不能为空")
    @Size(max = 64)
    private String username;

    @Schema(description = "Phone number")
    private String phone;

    @Schema(description = "Email")
    private String email;

    @Schema(description = "Real name")
    private String realName;

    @Schema(description = "Avatar URL")
    private String avatarUrl;

    @Schema(description = "Password")
    private String password;

    @Schema(description = "User type")
    private UserType userType;

    @Schema(description = "Role assignments")
    private List<UserRoleDTO> roles;

    /**
     * User role assignment.
     */
    @Data
    @Schema(description = "User role assignment")
    public static class UserRoleDTO {
        @Schema(description = "Role ID")
        private Long roleId;

        @Schema(description = "Project ID (for project-scoped roles)")
        private Long projectId;
    }
}
