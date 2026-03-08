package com.songhg.firefly.iot.rule.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmProcessDTO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRecordQueryDTO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRecordVO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRuleCreateDTO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRuleQueryDTO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRuleUpdateDTO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRuleVO;
import com.songhg.firefly.iot.rule.service.AlarmService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@Tag(name = "告警管理", description = "告警规则与告警记录")
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class AlarmController {

    private final AlarmService alarmService;

    // ==================== Alarm Rules ====================

    @PostMapping("/alarm-rules")
    @RequiresPermission("alarm:create")
    @Operation(summary = "创建告警规则")
    public R<AlarmRuleVO> createAlarmRule(@Valid @RequestBody AlarmRuleCreateDTO dto) {
        return R.ok(alarmService.createAlarmRule(dto));
    }

    @PostMapping("/alarm-rules/list")
    @RequiresPermission("alarm:read")
    @Operation(summary = "分页查询告警规则")
    public R<IPage<AlarmRuleVO>> listAlarmRules(@RequestBody AlarmRuleQueryDTO query) {
        return R.ok(alarmService.listAlarmRules(query));
    }

    @GetMapping("/alarm-rules/{id}")
    @RequiresPermission("alarm:read")
    @Operation(summary = "获取告警规则详情")
    public R<AlarmRuleVO> getAlarmRule(@Parameter(description = "告警规则编号", required = true) @PathVariable Long id) {
        return R.ok(alarmService.getAlarmRuleById(id));
    }

    @PutMapping("/alarm-rules/{id}")
    @RequiresPermission("alarm:update")
    @Operation(summary = "更新告警规则")
    public R<AlarmRuleVO> updateAlarmRule(@Parameter(description = "告警规则编号", required = true) @PathVariable Long id, @Valid @RequestBody AlarmRuleUpdateDTO dto) {
        return R.ok(alarmService.updateAlarmRule(id, dto));
    }

    @DeleteMapping("/alarm-rules/{id}")
    @RequiresPermission("alarm:delete")
    @Operation(summary = "删除告警规则")
    public R<Void> deleteAlarmRule(@Parameter(description = "告警规则编号", required = true) @PathVariable Long id) {
        alarmService.deleteAlarmRule(id);
        return R.ok();
    }

    // ==================== Alarm Records ====================

    @PostMapping("/alarm-records/list")
    @RequiresPermission("alarm:read")
    @Operation(summary = "分页查询告警记录")
    public R<IPage<AlarmRecordVO>> listAlarmRecords(@RequestBody AlarmRecordQueryDTO query) {
        return R.ok(alarmService.listAlarmRecords(query));
    }

    @GetMapping("/alarm-records/{id}")
    @RequiresPermission("alarm:read")
    @Operation(summary = "获取告警记录详情")
    public R<AlarmRecordVO> getAlarmRecord(@Parameter(description = "告警记录编号", required = true) @PathVariable Long id) {
        return R.ok(alarmService.getAlarmRecordById(id));
    }

    @PutMapping("/alarm-records/{id}/confirm")
    @RequiresPermission("alarm:confirm")
    @Operation(summary = "确认告警")
    public R<Void> confirmAlarmRecord(@Parameter(description = "告警记录编号", required = true) @PathVariable Long id) {
        alarmService.confirmAlarmRecord(id);
        return R.ok();
    }

    @PutMapping("/alarm-records/{id}/process")
    @RequiresPermission("alarm:process")
    @Operation(summary = "处理告警")
    public R<Void> processAlarmRecord(@Parameter(description = "告警记录编号", required = true) @PathVariable Long id, @RequestBody(required = false) AlarmProcessDTO dto) {
        alarmService.processAlarmRecord(id, dto);
        return R.ok();
    }

    @PutMapping("/alarm-records/{id}/close")
    @RequiresPermission("alarm:process")
    @Operation(summary = "关闭告警")
    public R<Void> closeAlarmRecord(@Parameter(description = "告警记录编号", required = true) @PathVariable Long id) {
        alarmService.closeAlarmRecord(id);
        return R.ok();
    }
}
