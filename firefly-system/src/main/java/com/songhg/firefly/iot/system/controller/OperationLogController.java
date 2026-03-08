package com.songhg.firefly.iot.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.convert.OperationLogConvert;
import com.songhg.firefly.iot.system.dto.operationlog.OperationLogQueryDTO;
import com.songhg.firefly.iot.system.dto.operationlog.OperationLogVO;
import com.songhg.firefly.iot.system.service.OperationLogService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@Tag(name = "操作日志", description = "查询操作日志")
@RestController
@RequestMapping("/api/v1/operation-logs")
@RequiredArgsConstructor
public class OperationLogController {

    private final OperationLogService operationLogService;

    @PostMapping("/list")
    @RequiresPermission("operation-log:read")
    @Operation(summary = "分页查询操作日志")
    public R<IPage<OperationLogVO>> list(@RequestBody OperationLogQueryDTO query) {
        return R.ok(operationLogService.list(query)
                .convert(OperationLogConvert.INSTANCE::toVO));
    }

    @GetMapping("/{id}")
    @RequiresPermission("operation-log:read")
    @Operation(summary = "获取操作日志详情")
    public R<OperationLogVO> getById(@Parameter(description = "操作日志编号", required = true) @PathVariable Long id) {
        return R.ok(OperationLogConvert.INSTANCE.toVO(operationLogService.getById(id)));
    }

    @PostMapping("/clean")
    @RequiresPermission("operation-log:delete")
    @Operation(summary = "清理过期操作日志")
    public R<Integer> cleanExpired(@Parameter(description = "保留天数") @RequestParam(defaultValue = "90") int days) {
        return R.ok(operationLogService.cleanExpired(days));
    }
}
