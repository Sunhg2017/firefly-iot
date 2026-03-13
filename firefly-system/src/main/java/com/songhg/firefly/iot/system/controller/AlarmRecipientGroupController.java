package com.songhg.firefly.iot.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.dto.alarmrecipient.AlarmRecipientGroupCreateDTO;
import com.songhg.firefly.iot.system.dto.alarmrecipient.AlarmRecipientGroupOptionVO;
import com.songhg.firefly.iot.system.dto.alarmrecipient.AlarmRecipientGroupQueryDTO;
import com.songhg.firefly.iot.system.dto.alarmrecipient.AlarmRecipientGroupVO;
import com.songhg.firefly.iot.system.service.AlarmRecipientGroupService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "Alarm Recipient Groups", description = "Tenant-scoped groups for alarm notification recipients")
@RestController
@RequestMapping("/api/v1/alarm-recipient-groups")
@RequiredArgsConstructor
public class AlarmRecipientGroupController {

    private final AlarmRecipientGroupService alarmRecipientGroupService;

    @PostMapping("/list")
    @RequiresPermission(value = {"alarm:read", "alarm:update"}, logical = RequiresPermission.Logical.OR)
    @Operation(summary = "List alarm recipient groups")
    public R<IPage<AlarmRecipientGroupVO>> list(@RequestBody AlarmRecipientGroupQueryDTO query) {
        return R.ok(alarmRecipientGroupService.listGroups(query));
    }

    @GetMapping("/options")
    @RequiresPermission(value = {"alarm:read", "alarm:update"}, logical = RequiresPermission.Logical.OR)
    @Operation(summary = "List alarm recipient group options")
    public R<List<AlarmRecipientGroupOptionVO>> options() {
        return R.ok(alarmRecipientGroupService.listGroupOptions());
    }

    @GetMapping("/{code}")
    @RequiresPermission(value = {"alarm:read", "alarm:update"}, logical = RequiresPermission.Logical.OR)
    @Operation(summary = "Get alarm recipient group detail")
    public R<AlarmRecipientGroupVO> get(
            @Parameter(description = "Group code", required = true) @PathVariable String code
    ) {
        return R.ok(alarmRecipientGroupService.getByCode(code));
    }

    @PostMapping
    @RequiresPermission("alarm:update")
    @Operation(summary = "Create alarm recipient group")
    public R<AlarmRecipientGroupVO> create(@Valid @RequestBody AlarmRecipientGroupCreateDTO dto) {
        return R.ok(alarmRecipientGroupService.create(dto));
    }

    @PutMapping("/{code}")
    @RequiresPermission("alarm:update")
    @Operation(summary = "Update alarm recipient group")
    public R<AlarmRecipientGroupVO> update(
            @Parameter(description = "Group code", required = true) @PathVariable String code,
            @Valid @RequestBody AlarmRecipientGroupCreateDTO dto
    ) {
        return R.ok(alarmRecipientGroupService.update(code, dto));
    }

    @DeleteMapping("/{code}")
    @RequiresPermission("alarm:update")
    @Operation(summary = "Delete alarm recipient group")
    public R<Void> delete(
            @Parameter(description = "Group code", required = true) @PathVariable String code
    ) {
        alarmRecipientGroupService.delete(code);
        return R.ok();
    }
}
