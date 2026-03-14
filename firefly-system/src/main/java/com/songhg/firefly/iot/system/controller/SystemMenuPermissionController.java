package com.songhg.firefly.iot.system.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.dto.workspace.WorkspaceMenuCatalogUpsertDTO;
import com.songhg.firefly.iot.system.dto.workspace.WorkspaceMenuNodeVO;
import com.songhg.firefly.iot.system.dto.workspace.WorkspaceMenuPermissionAssignDTO;
import com.songhg.firefly.iot.system.entity.WorkspaceMenuCatalog;
import com.songhg.firefly.iot.system.service.SystemMenuPermissionService;
import com.songhg.firefly.iot.system.service.WorkspaceMenuCatalogService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "系统菜单权限管理", description = "维护平台空间与租户空间的基础菜单层级和菜单权限集合")
@RestController
@RequestMapping("/api/v1/system-menu-permissions")
@RequiredArgsConstructor
public class SystemMenuPermissionController {

    private final SystemMenuPermissionService systemMenuPermissionService;
    private final WorkspaceMenuCatalogService workspaceMenuCatalogService;

    @GetMapping("/tree")
    @RequiresPermission("workspace-menu:read")
    @Operation(summary = "查询空间基础菜单树")
    public R<List<WorkspaceMenuNodeVO>> listTree(
            @Parameter(description = "空间范围: PLATFORM/TENANT", required = true)
            @RequestParam String workspaceScope) {
        return R.ok(systemMenuPermissionService.listTree(workspaceScope));
    }

    @PostMapping("/menus")
    @RequiresPermission("workspace-menu:update")
    @Operation(summary = "新增基础菜单")
    public R<WorkspaceMenuCatalog> createMenu(@Valid @RequestBody WorkspaceMenuCatalogUpsertDTO dto) {
        return R.ok(systemMenuPermissionService.createMenu(dto));
    }

    @PutMapping("/menus/{menuKey}")
    @RequiresPermission("workspace-menu:update")
    @Operation(summary = "编辑基础菜单")
    public R<WorkspaceMenuCatalog> updateMenu(
            @Parameter(description = "菜单业务唯一键", required = true) @PathVariable String menuKey,
            @Parameter(description = "空间范围: PLATFORM/TENANT", required = true) @RequestParam String workspaceScope,
            @Valid @RequestBody WorkspaceMenuCatalogUpsertDTO dto) {
        return R.ok(systemMenuPermissionService.updateMenu(workspaceScope, menuKey, dto));
    }

    @DeleteMapping("/menus/{menuKey}")
    @RequiresPermission("workspace-menu:update")
    @Operation(summary = "删除基础菜单")
    public R<Void> deleteMenu(
            @Parameter(description = "菜单业务唯一键", required = true) @PathVariable String menuKey,
            @Parameter(description = "空间范围: PLATFORM/TENANT", required = true) @RequestParam String workspaceScope) {
        systemMenuPermissionService.deleteMenu(workspaceScope, menuKey);
        return R.ok();
    }

    @PutMapping("/menus/{menuKey}/permissions")
    @RequiresPermission("workspace-menu:update")
    @Operation(summary = "替换菜单权限集合")
    public R<List<WorkspaceMenuNodeVO>> replacePermissions(
            @Parameter(description = "菜单业务唯一键", required = true) @PathVariable String menuKey,
            @Valid @RequestBody WorkspaceMenuPermissionAssignDTO dto) {
        return R.ok(systemMenuPermissionService.replaceMenuPermissions(
                dto.getWorkspaceScope(),
                menuKey,
                dto.getPermissionCodes()));
    }

    @GetMapping("/permission-codes")
    @RequiresPermission("workspace-menu:read")
    @Operation(summary = "查询空间下可分配权限编码")
    public R<List<String>> listPermissionCodes(
            @Parameter(description = "空间范围: PLATFORM/TENANT", required = true)
            @RequestParam String workspaceScope) {
        return R.ok(workspaceMenuCatalogService.listAllPermissionCodesByScope(workspaceScope).stream().toList());
    }
}
