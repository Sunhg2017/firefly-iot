package com.songhg.firefly.iot.system.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.dto.system.SystemConfigUpdateDTO;
import com.songhg.firefly.iot.system.dto.system.SystemConfigVO;
import com.songhg.firefly.iot.system.service.SystemConfigService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@Tag(name = "系统设置", description = "系统配置项管理")
@RestController
@RequestMapping("/api/v1/settings")
@RequiredArgsConstructor
public class SystemSettingsController {

    private final SystemConfigService systemConfigService;

    @Operation(summary = "按分组获取系统配置")
    @GetMapping("/configs")
    @RequiresPermission("system:read")
    public R<Map<String, List<SystemConfigVO>>> listConfigs() {
        return R.ok(systemConfigService.listGrouped());
    }

    @GetMapping("/configs/group/{group}")
    @RequiresPermission("system:read")
    @Operation(summary = "按分组获取系统配置")
    public R<List<SystemConfigVO>> listByGroup(
            @Parameter(description = "配置分组", required = true) @PathVariable String group) {
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
    @Operation(summary = "更新单个配置")
    public R<Void> updateConfig(@Valid @RequestBody SystemConfigUpdateDTO dto) {
        systemConfigService.updateConfig(dto);
        return R.ok();
    }
}
