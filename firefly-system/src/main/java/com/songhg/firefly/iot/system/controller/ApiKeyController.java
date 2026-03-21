package com.songhg.firefly.iot.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.enums.ApiKeyStatus;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.dto.apikey.ApiAccessLogQueryDTO;
import com.songhg.firefly.iot.system.dto.apikey.ApiAccessLogVO;
import com.songhg.firefly.iot.system.dto.apikey.ApiCallStatsVO;
import com.songhg.firefly.iot.system.dto.apikey.ApiKeyCreateDTO;
import com.songhg.firefly.iot.system.dto.apikey.ApiKeyCreatedVO;
import com.songhg.firefly.iot.system.dto.apikey.ApiKeyQueryDTO;
import com.songhg.firefly.iot.system.dto.apikey.ApiKeyUpdateDTO;
import com.songhg.firefly.iot.system.dto.apikey.ApiKeyVO;
import com.songhg.firefly.iot.system.dto.openapi.TenantOpenApiOptionVO;
import com.songhg.firefly.iot.system.dto.openapi.TenantOpenApiDocVO;
import com.songhg.firefly.iot.system.service.ApiAccessLogService;
import com.songhg.firefly.iot.system.service.ApiKeyService;
import com.songhg.firefly.iot.system.service.TenantOpenApiDocService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.DeleteMapping;
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

@Tag(name = "AppKey Management", description = "Tenant AppKey CRUD and access logs")
@RestController
@RequestMapping("/api/v1/app-keys")
@RequiredArgsConstructor
public class ApiKeyController {

    private final ApiKeyService apiKeyService;
    private final ApiAccessLogService apiAccessLogService;
    private final TenantOpenApiDocService tenantOpenApiDocService;

    @PostMapping
    @RequiresPermission("appkey:create")
    @Operation(summary = "Create AppKey")
    public R<ApiKeyCreatedVO> createApiKey(@Valid @RequestBody ApiKeyCreateDTO dto) {
        return R.ok(apiKeyService.createApiKey(dto));
    }

    @PostMapping("/list")
    @RequiresPermission("appkey:read")
    @Operation(summary = "Page query AppKeys")
    public R<IPage<ApiKeyVO>> listApiKeys(@RequestBody ApiKeyQueryDTO query) {
        return R.ok(apiKeyService.listApiKeys(query));
    }

    @GetMapping("/{id}")
    @RequiresPermission("appkey:read")
    @Operation(summary = "Get AppKey detail")
    public R<ApiKeyVO> getApiKey(@Parameter(description = "AppKey ID", required = true) @PathVariable Long id) {
        return R.ok(apiKeyService.getApiKeyById(id));
    }

    @PutMapping("/{id}")
    @RequiresPermission("appkey:update")
    @Operation(summary = "Update AppKey")
    public R<ApiKeyVO> updateApiKey(@Parameter(description = "AppKey ID", required = true) @PathVariable Long id,
                                    @Valid @RequestBody ApiKeyUpdateDTO dto) {
        return R.ok(apiKeyService.updateApiKey(id, dto));
    }

    @PutMapping("/{id}/status")
    @RequiresPermission("appkey:update")
    @Operation(summary = "Update AppKey status")
    public R<Void> updateApiKeyStatus(@Parameter(description = "AppKey ID", required = true) @PathVariable Long id,
                                      @Parameter(description = "New status") @RequestParam ApiKeyStatus status) {
        apiKeyService.updateApiKeyStatus(id, status);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("appkey:delete")
    @Operation(summary = "Delete AppKey")
    public R<Void> deleteApiKey(@Parameter(description = "AppKey ID", required = true) @PathVariable Long id) {
        apiKeyService.deleteApiKey(id);
        return R.ok();
    }

    @GetMapping("/open-api-options")
    @RequiresPermission("appkey:read")
    @Operation(summary = "List subscribed OpenAPI options for current tenant")
    public R<List<TenantOpenApiOptionVO>> listOpenApiOptions() {
        return R.ok(apiKeyService.listSubscribedOpenApiOptions());
    }

    @GetMapping("/open-api-docs")
    @RequiresPermission("appkey:read")
    @Operation(summary = "获取当前租户 OpenAPI 文档")
    public R<TenantOpenApiDocVO> getOpenApiDocs() {
        return R.ok(tenantOpenApiDocService.getCurrentTenantDocs());
    }

    @PostMapping("/{id}/logs")
    @RequiresPermission("appkey:read")
    @Operation(summary = "Query AppKey access logs")
    public R<IPage<ApiAccessLogVO>> queryLogs(@Parameter(description = "AppKey ID", required = true) @PathVariable Long id,
                                              @RequestBody ApiAccessLogQueryDTO query) {
        return R.ok(apiAccessLogService.queryLogs(id, query));
    }

    @GetMapping("/{id}/stats")
    @RequiresPermission("appkey:read")
    @Operation(summary = "Query AppKey daily stats")
    public R<List<ApiCallStatsVO>> queryStats(
            @Parameter(description = "AppKey ID", required = true) @PathVariable Long id,
            @Parameter(description = "Start date", required = true)
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @Parameter(description = "End date", required = true)
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return R.ok(apiAccessLogService.queryStats(id, startDate, endDate));
    }
}
