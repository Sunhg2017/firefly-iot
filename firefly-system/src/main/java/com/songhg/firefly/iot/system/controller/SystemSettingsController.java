package com.songhg.firefly.iot.system.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.dto.system.SystemConfigUpdateDTO;
import com.songhg.firefly.iot.system.dto.system.SystemConfigVO;
import com.songhg.firefly.iot.system.service.SystemConfigService;
import com.songhg.firefly.iot.system.dto.system.TenantAdminDefaultPermissionsUpdateDTO;
import com.songhg.firefly.iot.system.dto.system.TenantAdminDefaultPermissionsVO;
import com.songhg.firefly.iot.system.service.TenantAdminSettingsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Tag(name = "系统设置", description = "系统配置项管理")
@RestController
@RequestMapping("/api/v1/settings")
@RequiredArgsConstructor
public class SystemSettingsController {

    private final SystemConfigService systemConfigService;
    private final TenantAdminSettingsService tenantAdminSettingsService;

    // ==================== System Config ====================

    @Operation(summary = "获取系统配置（按分组）")
    @GetMapping("/configs")
    @RequiresPermission("system:read")
    public R<Map<String, List<SystemConfigVO>>> listConfigs() {
        return R.ok(systemConfigService.listGrouped());
    }

    @GetMapping("/configs/group/{group}")
    @RequiresPermission("system:read")
    @Operation(summary = "按分组获取配置")
    public R<List<SystemConfigVO>> listByGroup(@Parameter(description = "配置分组", required = true) @PathVariable String group) {
        return R.ok(systemConfigService.listByGroup(group));
    }

    @PutMapping("/configs")
    @RequiresPermission("system:update")
    @Operation(summary = "批量更新配置")
    public R<Void> updateConfigs(@Valid @RequestBody List<SystemConfigUpdateDTO> configs) {
        systemConfigService.batchUpdate(configs);
        return R.ok();
    }

    @PutMapping("/configs/single")
    @RequiresPermission("system:update")
    @Operation(summary = "更新单项配置")
    public R<Void> updateConfig(@Valid @RequestBody SystemConfigUpdateDTO dto) {
        systemConfigService.updateConfig(dto);
        return R.ok();
    }

    @GetMapping("/tenant-admin/default-permissions")
    @RequiresPermission("system:read")
    @Operation(summary = "获取新租户管理员默认权限配置")
    public R<TenantAdminDefaultPermissionsVO> getTenantAdminDefaultPermissions() {
        return R.ok(tenantAdminSettingsService.getDefaultPermissionsSettings());
    }

    @PutMapping("/tenant-admin/default-permissions")
    @RequiresPermission("system:update")
    @Operation(summary = "更新新租户管理员默认权限配置")
    public R<TenantAdminDefaultPermissionsVO> updateTenantAdminDefaultPermissions(
            @Valid @RequestBody TenantAdminDefaultPermissionsUpdateDTO dto) {
        return R.ok(tenantAdminSettingsService.updateDefaultPermissions(dto.getPermissions()));
    }
}
