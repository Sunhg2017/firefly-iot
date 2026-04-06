package com.songhg.firefly.iot.system.dto.tenant;

import com.songhg.firefly.iot.common.enums.IsolationLevel;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Tenant creation request.
 */
@Data
@Schema(description = "租户创建请求")
public class TenantCreateDTO {

    @Schema(description = "租户代码", example = "acme_corp")
    @NotBlank(message = "租户代码不能为空")
    @Size(max = 64)
    @Pattern(regexp = "[A-Za-z0-9_-]{2,63}$", message = "租户代码格式: 2-63位大小写字母、数字、中划线或下划线")
    private String code;

    @Schema(description = "租户名称", example = "Acme Corporation")
    @NotBlank(message = "租户名称不能为空")
    @Size(max = 256)
    private String name;

    @Schema(description = "显示名称")
    @Size(max = 256)
    private String displayName;

    @Schema(description = "描述")
    private String description;

    @Schema(description = "联系人姓名")
    private String contactName;

    @Schema(description = "联系电话")
    private String contactPhone;

    @Schema(description = "联系邮箱")
    private String contactEmail;

    @Schema(description = "数据隔离级别")
    private IsolationLevel isolationLevel;

    @Schema(description = "初始管理员")
    @Valid
    @NotNull
    private AdminUserDTO adminUser;

    /**
     * Initial admin user for the tenant.
     */
    @Data
    @Schema(description = "租户管理员")
    public static class AdminUserDTO {
        @Schema(description = "管理员用户名")
        @NotBlank
        private String username;

        @Schema(description = "手机号")
        private String phone;

        @Schema(description = "邮箱")
        private String email;

        @Schema(description = "Real name")
        private String realName;

        @Schema(description = "密码")
        @NotBlank
        private String password;
    }
}
