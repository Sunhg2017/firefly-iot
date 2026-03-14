package com.songhg.firefly.iot.system.dto.workspace;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "菜单绑定的权限项")
public class WorkspaceMenuPermissionVO {

    @Schema(description = "权限编码")
    private String permissionCode;

    @Schema(description = "权限名称")
    private String permissionLabel;

    @Schema(description = "权限排序")
    private Integer sortOrder;
}
