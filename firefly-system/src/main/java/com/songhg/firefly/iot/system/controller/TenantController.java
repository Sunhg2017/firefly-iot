package com.songhg.firefly.iot.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.enums.TenantStatus;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.dto.tenant.TenantCreateDTO;
import com.songhg.firefly.iot.system.dto.tenant.TenantAdminPasswordResetDTO;
import com.songhg.firefly.iot.system.dto.tenant.TenantOverviewVO;
import com.songhg.firefly.iot.system.dto.tenant.TenantPlanUpdateDTO;
import com.songhg.firefly.iot.system.dto.tenant.TenantQuotaUpdateDTO;
import com.songhg.firefly.iot.system.dto.tenant.TenantQuotaVO;
import com.songhg.firefly.iot.system.dto.tenant.TenantQueryDTO;
import com.songhg.firefly.iot.system.dto.tenant.TenantSpaceMenuAssignDTO;
import com.songhg.firefly.iot.system.dto.tenant.TenantSpaceMenuAuthorizationVO;
import com.songhg.firefly.iot.system.dto.tenant.TenantUpdateDTO;
import com.songhg.firefly.iot.system.dto.tenant.TenantUsageDailyVO;
import com.songhg.firefly.iot.system.dto.tenant.TenantUsageVO;
import com.songhg.firefly.iot.system.dto.tenant.TenantVO;
import com.songhg.firefly.iot.system.service.TenantService;
import com.songhg.firefly.iot.system.service.UserDomainService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@Tag(name = "Tenant Management (Platform)")
@RestController
@RequestMapping("/api/v1/platform/tenants")
@RequiredArgsConstructor
public class TenantController {

    private final TenantService tenantService;
    private final UserDomainService userDomainService;

    @PostMapping
    @RequiresPermission("tenant:manage")
    @Operation(summary = "Create tenant")
    public R<TenantVO> createTenant(@Valid @RequestBody TenantCreateDTO dto) {
        userDomainService.assertCurrentUserIsSystemOps();
        return R.ok(tenantService.createTenant(dto));
    }

    @PostMapping("/list")
    @RequiresPermission("tenant:read")
    @Operation(summary = "List tenants")
    public R<IPage<TenantVO>> listTenants(@RequestBody TenantQueryDTO query) {
        userDomainService.assertCurrentUserIsSystemOps();
        return R.ok(tenantService.listTenants(query));
    }

    @GetMapping("/{id}")
    @RequiresPermission("tenant:read")
    @Operation(summary = "Get tenant detail")
    public R<TenantVO> getTenant(@Parameter(description = "Tenant ID", required = true) @PathVariable Long id) {
        userDomainService.assertCurrentUserIsSystemOps();
        return R.ok(tenantService.getTenantById(id));
    }

    @PutMapping("/{id}")
    @RequiresPermission("tenant:manage")
    @Operation(summary = "Update tenant")
    public R<TenantVO> updateTenant(@Parameter(description = "Tenant ID", required = true) @PathVariable Long id,
                                    @Valid @RequestBody TenantUpdateDTO dto) {
        userDomainService.assertCurrentUserIsSystemOps();
        return R.ok(tenantService.updateTenant(id, dto));
    }

    @PutMapping("/{id}/status")
    @RequiresPermission("tenant:manage")
    @Operation(summary = "Update tenant status")
    public R<Void> updateTenantStatus(@Parameter(description = "Tenant ID", required = true) @PathVariable Long id,
                                      @Parameter(description = "New status") @RequestParam TenantStatus status,
                                      @Parameter(description = "Reason") @RequestParam(required = false) String reason) {
        userDomainService.assertCurrentUserIsSystemOps();
        tenantService.updateTenantStatus(id, status, reason);
        return R.ok();
    }

    @PutMapping("/{id}/plan")
    @RequiresPermission("tenant:manage")
    @Operation(summary = "Update tenant plan")
    public R<TenantVO> updatePlan(@Parameter(description = "Tenant ID", required = true) @PathVariable Long id,
                                  @Valid @RequestBody TenantPlanUpdateDTO dto) {
        userDomainService.assertCurrentUserIsSystemOps();
        return R.ok(tenantService.updatePlan(id, dto.getPlan()));
    }

    @GetMapping("/{id}/quota")
    @RequiresPermission("tenant:read")
    @Operation(summary = "Get tenant quota")
    public R<TenantQuotaVO> getQuota(@Parameter(description = "Tenant ID", required = true) @PathVariable Long id) {
        userDomainService.assertCurrentUserIsSystemOps();
        return R.ok(tenantService.getQuota(id));
    }

    @PutMapping("/{id}/quota")
    @RequiresPermission("tenant:manage")
    @Operation(summary = "Update tenant quota")
    public R<TenantQuotaVO> updateQuota(@Parameter(description = "Tenant ID", required = true) @PathVariable Long id,
                                        @Valid @RequestBody TenantQuotaUpdateDTO dto) {
        userDomainService.assertCurrentUserIsSystemOps();
        return R.ok(tenantService.updateQuota(id, dto));
    }

    @GetMapping("/{id}/space-menus")
    @RequiresPermission("tenant:manage")
    @Operation(summary = "Get tenant space menus")
    public R<TenantSpaceMenuAuthorizationVO> getTenantSpaceMenus(
            @Parameter(description = "Tenant ID", required = true) @PathVariable Long id) {
        userDomainService.assertCurrentUserIsSystemOps();
        return R.ok(tenantService.getTenantSpaceMenus(id));
    }

    @PutMapping("/{id}/space-menus")
    @RequiresPermission("tenant:manage")
    @Operation(summary = "Update tenant space menus")
    public R<TenantSpaceMenuAuthorizationVO> updateTenantSpaceMenus(
            @Parameter(description = "Tenant ID", required = true) @PathVariable Long id,
            @Valid @RequestBody TenantSpaceMenuAssignDTO items) {
        userDomainService.assertCurrentUserIsSystemOps();
        return R.ok(tenantService.updateTenantSpaceMenus(id, items));
    }

    @GetMapping("/{id}/usage")
    @RequiresPermission("tenant:read")
    @Operation(summary = "Get tenant usage")
    public R<TenantUsageVO> getUsage(@Parameter(description = "Tenant ID", required = true) @PathVariable Long id) {
        userDomainService.assertCurrentUserIsSystemOps();
        return R.ok(tenantService.getUsage(id));
    }

    @GetMapping("/{id}/usage/daily")
    @RequiresPermission("tenant:read")
    @Operation(summary = "Get tenant daily usage")
    public R<List<TenantUsageDailyVO>> getUsageDaily(
            @Parameter(description = "Tenant ID", required = true) @PathVariable Long id,
            @Parameter(description = "Start date") @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @Parameter(description = "End date") @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        userDomainService.assertCurrentUserIsSystemOps();
        return R.ok(tenantService.getUsageDaily(id, startDate, endDate));
    }

    @PostMapping("/{id}/deactivate")
    @RequiresPermission("tenant:manage")
    @Operation(summary = "Deactivate tenant")
    public R<Void> deactivateTenant(@Parameter(description = "Tenant ID", required = true) @PathVariable Long id) {
        userDomainService.assertCurrentUserIsSystemOps();
        tenantService.deactivateTenant(id);
        return R.ok();
    }

    @PostMapping("/{id}/admin-password/reset")
    @RequiresPermission("tenant:manage")
    @Operation(summary = "Reset tenant super admin password")
    public R<Void> resetTenantAdminPassword(
            @Parameter(description = "Tenant ID", required = true) @PathVariable Long id,
            @Valid @RequestBody TenantAdminPasswordResetDTO dto) {
        userDomainService.assertCurrentUserIsSystemOps();
        tenantService.resetTenantAdminPassword(id, dto.getNewPassword());
        return R.ok();
    }

    @GetMapping("/overview")
    @RequiresPermission("tenant:read")
    @Operation(summary = "Tenant overview")
    public R<TenantOverviewVO> getOverview() {
        userDomainService.assertCurrentUserIsSystemOps();
        return R.ok(tenantService.getOverview());
    }
}
