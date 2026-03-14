package com.songhg.firefly.iot.system.dto.workspace;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "Workspace menu permission catalog entry")
public class WorkspaceMenuPermissionCatalogVO {

    @Schema(description = "Record id")
    private Long id;

    @Schema(description = "Workspace scope")
    private String workspaceScope;

    @Schema(description = "Module key")
    private String moduleKey;

    @Schema(description = "Module label")
    private String moduleLabel;

    @Schema(description = "Menu path")
    private String menuPath;

    @Schema(description = "Permission code")
    private String permissionCode;

    @Schema(description = "Permission label")
    private String permissionLabel;

    @Schema(description = "Module sort order")
    private Integer moduleSortOrder;

    @Schema(description = "Permission sort order")
    private Integer permissionSortOrder;

    @Schema(description = "Visible in role permission catalog")
    private Boolean roleCatalogVisible;
}
