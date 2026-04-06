package com.songhg.firefly.iot.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.dto.audit.AuditLogQueryDTO;
import com.songhg.firefly.iot.system.dto.audit.AuditLogVO;
import com.songhg.firefly.iot.system.service.AuditLogService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@Tag(name = "审计日志", description = "查询系统审计日志")
@RestController
@RequestMapping("/api/v1/audit-logs")
@RequiredArgsConstructor
public class AuditLogController {

    private final AuditLogService auditLogService;

    @PostMapping("/list")
    @RequiresPermission("audit:read")
    @Operation(summary = "分页查询审计日志")
    public R<IPage<AuditLogVO>> list(@RequestBody AuditLogQueryDTO query) {
        return R.ok(auditLogService.listAuditLogs(query));
    }

    @GetMapping("/{id}")
    @RequiresPermission("audit:read")
    @Operation(summary = "获取审计日志详情")
    public R<AuditLogVO> getById(@Parameter(description = "审计日志编号", required = true) @PathVariable Long id) {
        return R.ok(auditLogService.getById(id));
    }
}
