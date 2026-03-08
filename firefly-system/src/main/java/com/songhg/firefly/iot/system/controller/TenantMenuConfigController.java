package com.songhg.firefly.iot.system.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresLogin;
import com.songhg.firefly.iot.system.dto.menu.MenuConfigCreateDTO;
import com.songhg.firefly.iot.system.dto.menu.MenuConfigSortDTO;
import com.songhg.firefly.iot.system.dto.menu.MenuConfigUpdateDTO;
import com.songhg.firefly.iot.system.dto.menu.MenuConfigVO;
import com.songhg.firefly.iot.system.service.TenantMenuConfigService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "租户菜单配置", description = "租户自定义菜单展示顺序和层级")
@RestController
@RequestMapping("/api/v1/tenant/menu-configs")
@RequiredArgsConstructor
@RequiresLogin
public class TenantMenuConfigController {

    private final TenantMenuConfigService menuConfigService;

    @GetMapping("/tree")
    @Operation(summary = "查询菜单树形结构")
    public R<List<MenuConfigVO>> getMenuTree() {
        return R.ok(menuConfigService.getMenuTree());
    }

    @GetMapping
    @Operation(summary = "查询菜单列表（扁平）")
    public R<List<MenuConfigVO>> getMenuList() {
        return R.ok(menuConfigService.getMenuList());
    }

    @PostMapping
    @Operation(summary = "创建菜单项")
    public R<MenuConfigVO> create(@Valid @RequestBody MenuConfigCreateDTO dto) {
        return R.ok(menuConfigService.create(dto));
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新菜单项")
    public R<MenuConfigVO> update(@Parameter(description = "菜单配置编号", required = true) @PathVariable Long id, @Valid @RequestBody MenuConfigUpdateDTO dto) {
        return R.ok(menuConfigService.update(id, dto));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除菜单项")
    public R<Void> delete(@Parameter(description = "菜单配置编号", required = true) @PathVariable Long id) {
        menuConfigService.delete(id);
        return R.ok();
    }

    @PutMapping("/sort")
    @Operation(summary = "批量排序菜单")
    public R<Void> batchSort(@Valid @RequestBody List<MenuConfigSortDTO> sortList) {
        menuConfigService.batchSort(sortList);
        return R.ok();
    }

    @PostMapping("/init")
    @Operation(summary = "初始化默认菜单配置")
    public R<Void> initDefaults(@Valid @RequestBody List<MenuConfigCreateDTO> defaults) {
        menuConfigService.initDefaultMenus(defaults);
        return R.ok();
    }
}
