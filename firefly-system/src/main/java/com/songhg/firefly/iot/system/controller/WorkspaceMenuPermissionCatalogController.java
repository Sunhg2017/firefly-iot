package com.songhg.firefly.iot.system.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.dto.workspace.WorkspaceMenuPermissionCatalogVO;
import com.songhg.firefly.iot.system.service.WorkspacePermissionCatalogService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "Workspace Permission Catalog", description = "Workspace menu and permission bindings")
@RestController
@RequestMapping("/api/v1/workspace-permission-catalog")
@RequiredArgsConstructor
public class WorkspaceMenuPermissionCatalogController {

    private final WorkspacePermissionCatalogService workspacePermissionCatalogService;

    @GetMapping
    @RequiresPermission("permission:read")
    @Operation(summary = "List workspace menu permission catalog")
    public R<List<WorkspaceMenuPermissionCatalogVO>> listCatalog(
            @Parameter(description = "Workspace scope filter: PLATFORM/TENANT")
            @RequestParam(required = false) String workspaceScope,
            @Parameter(description = "Keyword filter on module label, menu path, permission code, permission label")
            @RequestParam(required = false) String keyword) {
        return R.ok(workspacePermissionCatalogService.listCatalogForSystemOps(workspaceScope, keyword));
    }
}
