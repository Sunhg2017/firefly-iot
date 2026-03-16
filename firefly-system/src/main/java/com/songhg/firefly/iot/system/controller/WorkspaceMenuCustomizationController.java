package com.songhg.firefly.iot.system.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresLogin;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.dto.workspace.WorkspaceMenuCustomizationUpdateDTO;
import com.songhg.firefly.iot.system.dto.workspace.WorkspaceMenuNodeVO;
import com.songhg.firefly.iot.system.service.WorkspaceMenuCustomizationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "当前空间菜单配置", description = "维护当前租户在当前工作空间下的菜单显示层级、名称和排序")
@RestController
@RequestMapping("/api/v1/workspace-menu-customizations")
@RequiredArgsConstructor
public class WorkspaceMenuCustomizationController {

    private final WorkspaceMenuCustomizationService workspaceMenuCustomizationService;

    @GetMapping("/current/tree")
    @RequiresLogin
    @Operation(summary = "查询当前用户当前工作空间生效菜单树")
    public R<List<WorkspaceMenuNodeVO>> getCurrentWorkspaceTree() {
        return R.ok(workspaceMenuCustomizationService.listCurrentUserMenuTree());
    }

    @GetMapping("/current/manage/tree")
    @RequiresPermission("menu-customization:read")
    @Operation(summary = "查询当前管理员可配置菜单树")
    public R<List<WorkspaceMenuNodeVO>> getCurrentWorkspaceManageTree() {
        return R.ok(workspaceMenuCustomizationService.listCurrentWorkspaceConfigTree());
    }

    @PutMapping("/current/menus/{menuKey}")
    @RequiresPermission("menu-customization:update")
    @Operation(summary = "更新当前工作空间菜单个性化配置")
    public R<List<WorkspaceMenuNodeVO>> updateCurrentWorkspaceMenu(
            @Parameter(description = "菜单业务唯一键", required = true) @PathVariable String menuKey,
            @Valid @RequestBody WorkspaceMenuCustomizationUpdateDTO dto) {
        return R.ok(workspaceMenuCustomizationService.updateCurrentWorkspaceMenu(menuKey, dto));
    }

    @DeleteMapping("/current/menus/{menuKey}")
    @RequiresPermission("menu-customization:update")
    @Operation(summary = "重置当前工作空间菜单个性化配置")
    public R<List<WorkspaceMenuNodeVO>> resetCurrentWorkspaceMenu(
            @Parameter(description = "菜单业务唯一键", required = true) @PathVariable String menuKey) {
        return R.ok(workspaceMenuCustomizationService.resetCurrentWorkspaceMenu(menuKey));
    }
}
