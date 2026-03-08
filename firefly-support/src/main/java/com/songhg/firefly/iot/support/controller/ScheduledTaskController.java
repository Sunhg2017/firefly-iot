package com.songhg.firefly.iot.support.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.support.convert.ScheduledTaskConvert;
import com.songhg.firefly.iot.support.dto.scheduledtask.ScheduledTaskCreateDTO;
import com.songhg.firefly.iot.support.dto.scheduledtask.ScheduledTaskLogQueryDTO;
import com.songhg.firefly.iot.support.dto.scheduledtask.ScheduledTaskLogVO;
import com.songhg.firefly.iot.support.dto.scheduledtask.ScheduledTaskQueryDTO;
import com.songhg.firefly.iot.support.dto.scheduledtask.ScheduledTaskUpdateDTO;
import com.songhg.firefly.iot.support.dto.scheduledtask.ScheduledTaskVO;
import com.songhg.firefly.iot.support.service.ScheduledTaskService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@Tag(name = "定时任务管理", description = "定时任务 CRUD、启停、手动执行、执行日志")
@RestController
@RequestMapping("/api/v1/scheduled-tasks")
@RequiredArgsConstructor
public class ScheduledTaskController {

    private final ScheduledTaskService scheduledTaskService;

    @Operation(summary = "创建定时任务")
    @PostMapping
    @RequiresPermission("system:update")
    public R<ScheduledTaskVO> create(@Valid @RequestBody ScheduledTaskCreateDTO dto) {
        return R.ok(ScheduledTaskConvert.INSTANCE.toVO(scheduledTaskService.create(dto)));
    }

    @Operation(summary = "更新定时任务")
    @PutMapping("/{id}")
    @RequiresPermission("system:update")
    public R<ScheduledTaskVO> update(@Parameter(description = "任务编号", required = true) @PathVariable Long id, @Valid @RequestBody ScheduledTaskUpdateDTO dto) {
        return R.ok(ScheduledTaskConvert.INSTANCE.toVO(scheduledTaskService.update(id, dto)));
    }

    @Operation(summary = "删除定时任务")
    @DeleteMapping("/{id}")
    @RequiresPermission("system:update")
    public R<Void> delete(@Parameter(description = "任务编号", required = true) @PathVariable Long id) {
        scheduledTaskService.delete(id);
        return R.ok();
    }

    @Operation(summary = "获取定时任务详情")
    @GetMapping("/{id}")
    @RequiresPermission("system:read")
    public R<ScheduledTaskVO> getById(@Parameter(description = "任务编号", required = true) @PathVariable Long id) {
        return R.ok(ScheduledTaskConvert.INSTANCE.toVO(scheduledTaskService.getById(id)));
    }

    @Operation(summary = "分页查询定时任务")
    @PostMapping("/list")
    @RequiresPermission("system:read")
    public R<IPage<ScheduledTaskVO>> list(@RequestBody ScheduledTaskQueryDTO query) {
        return R.ok(scheduledTaskService.list(query)
                .convert(ScheduledTaskConvert.INSTANCE::toVO));
    }

    @Operation(summary = "启用定时任务")
    @PutMapping("/{id}/enable")
    @RequiresPermission("system:update")
    public R<Void> enable(@Parameter(description = "任务编号", required = true) @PathVariable Long id) {
        scheduledTaskService.enable(id);
        return R.ok();
    }

    @Operation(summary = "停用定时任务")
    @PutMapping("/{id}/disable")
    @RequiresPermission("system:update")
    public R<Void> disable(@Parameter(description = "任务编号", required = true) @PathVariable Long id) {
        scheduledTaskService.disable(id);
        return R.ok();
    }

    @Operation(summary = "手动执行一次")
    @PostMapping("/{id}/execute")
    @RequiresPermission("system:update")
    public R<Void> executeOnce(@Parameter(description = "任务编号", required = true) @PathVariable Long id) {
        scheduledTaskService.executeOnce(id);
        return R.ok();
    }

    @Operation(summary = "查询执行日志")
    @PostMapping("/logs/list")
    @RequiresPermission("system:read")
    public R<IPage<ScheduledTaskLogVO>> listLogs(@RequestBody ScheduledTaskLogQueryDTO query) {
        return R.ok(scheduledTaskService.listLogs(query)
                .convert(ScheduledTaskConvert.INSTANCE::toLogVO));
    }

    @Operation(summary = "清理执行日志")
    @PostMapping("/logs/clean")
    @RequiresPermission("system:update")
    public R<Integer> cleanLogs(@Parameter(description = "保留天数") @RequestParam(defaultValue = "30") int days) {
        return R.ok(scheduledTaskService.cleanLogs(days));
    }
}
