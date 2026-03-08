package com.songhg.firefly.iot.system.dto.system;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "Tenant admin default permissions update request")
public class TenantAdminDefaultPermissionsUpdateDTO {

    @NotEmpty(message = "默认权限不能为空")
    @Schema(description = "Default permissions")
    private List<@NotBlank(message = "权限编码不能为空") String> permissions;
}
