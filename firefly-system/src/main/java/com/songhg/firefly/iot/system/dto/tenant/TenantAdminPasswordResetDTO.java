package com.songhg.firefly.iot.system.dto.tenant;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@Schema(description = "租户超级管理员密码重置请求")
public class TenantAdminPasswordResetDTO {

    @NotBlank(message = "newPassword is required")
    @Schema(description = "新的随机密码", requiredMode = Schema.RequiredMode.REQUIRED)
    private String newPassword;
}
