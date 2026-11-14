package com.songhg.firefly.iot.rule.dataforward.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.rule.dataforward.dto.DataForwardRuleCreateDTO;
import com.songhg.firefly.iot.rule.dataforward.dto.DataForwardRuleQueryDTO;
import com.songhg.firefly.iot.rule.dataforward.dto.DataForwardRuleUpdateDTO;
import com.songhg.firefly.iot.rule.dataforward.dto.DataForwardRuleVO;
import com.songhg.firefly.iot.rule.dataforward.service.DataForwardRuleService;
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

@Tag(name = "数据流转规则", description = "数据流转规则 CRUD、启停")
@RestController
@RequestMapping("/api/v1/data-forward-rules")
@RequiredArgsConstructor
public class DataForwardRuleController {

    private final DataForwardRuleService ruleService;

    @PostMapping
    @RequiresPermission("data-forward:create")
    @Operation(summary = "创建数据流转规则")
    public R<DataForwardRuleVO> create(@Valid @RequestBody DataForwardRuleCreateDTO dto) {
        return R.ok(ruleService.create(dto));
    }

    @PostMapping("/list")
    @RequiresPermission("data-forward:read")
    @Operation(summary = "分页查询数据流转规则")
    public R<IPage<DataForwardRuleVO>> list(@RequestBody DataForwardRuleQueryDTO query) {
        return R.ok(ruleService.list(query));
    }

    @GetMapping("/{id}")
    @RequiresPermission("data-forward:read")
    @Operation(summary = "获取数据流转规则详情")
    public R<DataForwardRuleVO> get(@Parameter(description = "规则编号", required = true) @PathVariable Long id) {
        return R.ok(ruleService.getById(id));
    }

    @PutMapping("/{id}")
    @RequiresPermission("data-forward:update")
    @Operation(summary = "更新数据流转规则")
    public R<DataForwardRuleVO> update(@Parameter(description = "规则编号", required = true) @PathVariable Long id,
                                       @Valid @RequestBody DataForwardRuleUpdateDTO dto) {
        return R.ok(ruleService.update(id, dto));
    }

    @PutMapping("/{id}/enable")
    @RequiresPermission("data-forward:update")
    @Operation(summary = "启用数据流转规则")
    public R<Void> enable(@Parameter(description = "规则编号", required = true) @PathVariable Long id) {
        ruleService.enable(id);
        return R.ok();
    }

    @PutMapping("/{id}/disable")
    @RequiresPermission("data-forward:update")
    @Operation(summary = "停用数据流转规则")
    public R<Void> disable(@Parameter(description = "规则编号", required = true) @PathVariable Long id) {
        ruleService.disable(id);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("data-forward:delete")
    @Operation(summary = "删除数据流转规则")
    public R<Void> delete(@Parameter(description = "规则编号", required = true) @PathVariable Long id) {
        ruleService.delete(id);
        return R.ok();
    }
}
