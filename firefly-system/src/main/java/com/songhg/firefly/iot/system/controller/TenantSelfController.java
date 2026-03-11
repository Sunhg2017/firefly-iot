package com.songhg.firefly.iot.system.controller;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresLogin;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.dto.tenant.*;
import com.songhg.firefly.iot.system.service.TenantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@Tag(name = "当前租户", description = "当前租户自助查看信息、配额、用量")
@RestController
@RequestMapping("/api/v1/tenant")
@RequiredArgsConstructor
public class TenantSelfController {

    private final TenantService tenantService;

    @RequiresLogin
    @GetMapping
    @Operation(summary = "获取当前租户信息")
    public R<TenantVO> getCurrentTenant() {
        Long tenantId = AppContextHolder.getTenantId();
        return R.ok(tenantService.getTenantById(tenantId));
    }

    @PutMapping
    @RequiresPermission("tenant:manage")
    @Operation(summary = "更新当前租户信息")
    public R<TenantVO> updateCurrentTenant(@Valid @RequestBody TenantUpdateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        return R.ok(tenantService.updateTenant(tenantId, dto));
    }

    @RequiresLogin
    @GetMapping("/quota")
    @Operation(summary = "获取配额与用量")
    public R<TenantQuotaUsageVO> getQuotaAndUsage() {
        Long tenantId = AppContextHolder.getTenantId();
        return R.ok(tenantService.getQuotaAndUsage(tenantId));
    }

    @RequiresLogin
    @GetMapping("/usage")
    @Operation(summary = "获取当前用量")
    public R<TenantUsageVO> getUsage() {
        Long tenantId = AppContextHolder.getTenantId();
        return R.ok(tenantService.getUsage(tenantId));
    }

    @RequiresLogin
    @GetMapping("/usage/daily")
    @Operation(summary = "获取每日用量")
    public R<List<TenantUsageDailyVO>> getUsageDaily(
            @Parameter(description = "开始日期") @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @Parameter(description = "结束日期") @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        Long tenantId = AppContextHolder.getTenantId();
        return R.ok(tenantService.getUsageDaily(tenantId, startDate, endDate));
    }
}
