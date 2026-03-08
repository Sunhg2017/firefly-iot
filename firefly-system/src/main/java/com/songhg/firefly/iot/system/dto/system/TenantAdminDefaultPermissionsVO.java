package com.songhg.firefly.iot.system.dto.system;

import com.songhg.firefly.iot.system.dto.permission.PermissionResourceVO;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "Tenant admin default permissions view object")
public class TenantAdminDefaultPermissionsVO {

    @Schema(description = "Selected default permissions")
    private List<String> permissions;

    @Schema(description = "Current value source")
    private String source;

    @Schema(description = "Available permissions")
    private List<PermissionResourceVO> availablePermissions;
}
