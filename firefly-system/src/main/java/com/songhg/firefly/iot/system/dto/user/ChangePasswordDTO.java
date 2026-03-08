package com.songhg.firefly.iot.system.dto.user;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Change password request.
 */
@Data
@Schema(description = "Change password request")
public class ChangePasswordDTO {

    @Schema(description = "Old password")
    @NotBlank(message = "旧密码不能为空")
    private String oldPassword;

    @Schema(description = "New password")
    @NotBlank(message = "新密码不能为空")
    private String newPassword;
}
