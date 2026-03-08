package com.songhg.firefly.iot.rule.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.rule.dto.ruleengine.RuleEngineCreateDTO;
import com.songhg.firefly.iot.rule.dto.ruleengine.RuleEngineQueryDTO;
import com.songhg.firefly.iot.rule.dto.ruleengine.RuleEngineUpdateDTO;
import com.songhg.firefly.iot.rule.dto.ruleengine.RuleEngineVO;
import com.songhg.firefly.iot.rule.service.RuleEngineService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@Tag(name = "规则引擎", description = "规则 CRUD、规则动作管理")
@RestController
@RequestMapping("/api/v1/rules")
@RequiredArgsConstructor
public class RuleEngineController {

    private final RuleEngineService ruleEngineService;

    @PostMapping
    @RequiresPermission("rule:create")
    @Operation(summary = "创建规则")
    public R<RuleEngineVO> createRule(@Valid @RequestBody RuleEngineCreateDTO dto) {
        return R.ok(ruleEngineService.createRule(dto));
    }

    @PostMapping("/list")
    @RequiresPermission("rule:read")
    @Operation(summary = "分页查询规则")
    public R<IPage<RuleEngineVO>> listRules(@RequestBody RuleEngineQueryDTO query) {
        return R.ok(ruleEngineService.listRules(query));
    }

    @GetMapping("/{id}")
    @RequiresPermission("rule:read")
    @Operation(summary = "获取规则详情")
    public R<RuleEngineVO> getRule(@Parameter(description = "规则编号", required = true) @PathVariable Long id) {
        return R.ok(ruleEngineService.getRuleById(id));
    }

    @PutMapping("/{id}")
    @RequiresPermission("rule:update")
    @Operation(summary = "更新规则")
    public R<RuleEngineVO> updateRule(@Parameter(description = "规则编号", required = true) @PathVariable Long id, @Valid @RequestBody RuleEngineUpdateDTO dto) {
        return R.ok(ruleEngineService.updateRule(id, dto));
    }

    @PutMapping("/{id}/enable")
    @RequiresPermission("rule:enable")
    @Operation(summary = "启用规则")
    public R<Void> enableRule(@Parameter(description = "规则编号", required = true) @PathVariable Long id) {
        ruleEngineService.enableRule(id);
        return R.ok();
    }

    @PutMapping("/{id}/disable")
    @RequiresPermission("rule:enable")
    @Operation(summary = "禁用规则")
    public R<Void> disableRule(@Parameter(description = "规则编号", required = true) @PathVariable Long id) {
        ruleEngineService.disableRule(id);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("rule:delete")
    @Operation(summary = "删除规则")
    public R<Void> deleteRule(@Parameter(description = "规则编号", required = true) @PathVariable Long id) {
        ruleEngineService.deleteRule(id);
        return R.ok();
    }
}
