package com.songhg.firefly.iot.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.enums.ApiKeyStatus;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.dto.apikey.*;
import com.songhg.firefly.iot.system.service.ApiAccessLogService;
import com.songhg.firefly.iot.system.service.ApiKeyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@Tag(name = "API Key 管理", description = "API Key CRUD、调用日志、统计")
@RestController
@RequestMapping("/api/v1/api-keys")
@RequiredArgsConstructor
public class ApiKeyController {

    private final ApiKeyService apiKeyService;
    private final ApiAccessLogService apiAccessLogService;

    @PostMapping
    @RequiresPermission("apikey:create")
    @Operation(summary = "创建 API Key")
    public R<ApiKeyCreatedVO> createApiKey(@Valid @RequestBody ApiKeyCreateDTO dto) {
        return R.ok(apiKeyService.createApiKey(dto));
    }

    @PostMapping("/list")
    @RequiresPermission("apikey:read")
    @Operation(summary = "分页查询 API Key")
    public R<IPage<ApiKeyVO>> listApiKeys(@RequestBody ApiKeyQueryDTO query) {
        return R.ok(apiKeyService.listApiKeys(query));
    }

    @GetMapping("/{id}")
    @RequiresPermission("apikey:read")
    @Operation(summary = "获取 API Key 详情")
    public R<ApiKeyVO> getApiKey(@Parameter(description = "接口密钥编号", required = true) @PathVariable Long id) {
        return R.ok(apiKeyService.getApiKeyById(id));
    }

    @PutMapping("/{id}")
    @RequiresPermission("apikey:update")
    @Operation(summary = "更新 API Key")
    public R<ApiKeyVO> updateApiKey(@Parameter(description = "接口密钥编号", required = true) @PathVariable Long id, @Valid @RequestBody ApiKeyUpdateDTO dto) {
        return R.ok(apiKeyService.updateApiKey(id, dto));
    }

    @PutMapping("/{id}/status")
    @RequiresPermission("apikey:update")
    @Operation(summary = "更新 API Key 状态")
    public R<Void> updateApiKeyStatus(@Parameter(description = "接口密钥编号", required = true) @PathVariable Long id, @Parameter(description = "新状态") @RequestParam ApiKeyStatus status) {
        apiKeyService.updateApiKeyStatus(id, status);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("apikey:delete")
    @Operation(summary = "删除 API Key")
    public R<Void> deleteApiKey(@Parameter(description = "接口密钥编号", required = true) @PathVariable Long id) {
        apiKeyService.deleteApiKey(id);
        return R.ok();
    }

    @PostMapping("/{id}/logs")
    @RequiresPermission("apikey:read")
    @Operation(summary = "查询调用日志")
    public R<IPage<ApiAccessLogVO>> queryLogs(@Parameter(description = "接口密钥编号", required = true) @PathVariable Long id, @RequestBody ApiAccessLogQueryDTO query) {
        return R.ok(apiAccessLogService.queryLogs(id, query));
    }

    @GetMapping("/{id}/stats")
    @RequiresPermission("apikey:read")
    @Operation(summary = "查询调用统计")
    public R<List<ApiCallStatsVO>> queryStats(
            @Parameter(description = "接口密钥编号", required = true) @PathVariable Long id,
            @Parameter(description = "开始日期", required = true) @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @Parameter(description = "结束日期", required = true) @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return R.ok(apiAccessLogService.queryStats(id, startDate, endDate));
    }
}
