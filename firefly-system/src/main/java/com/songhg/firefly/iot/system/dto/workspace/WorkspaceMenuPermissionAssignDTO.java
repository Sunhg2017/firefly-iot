package com.songhg.firefly.iot.system.dto.workspace;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "菜单权限绑定请求")
public class WorkspaceMenuPermissionAssignDTO {

    @Schema(description = "所属空间", example = "TENANT")
    @NotNull(message = "所属空间不能为空")
    private String workspaceScope;

    @Schema(description = "权限编码列表")
    private List<String> permissionCodes;
}
