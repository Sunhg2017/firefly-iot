package com.songhg.firefly.iot.data.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.data.dto.dashboard.CustomDashboardSaveDTO;
import com.songhg.firefly.iot.data.dto.dashboard.CustomDashboardVO;
import com.songhg.firefly.iot.data.service.CustomDashboardService;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "自定义看板", description = "自定义看板 / 运营大屏的保存、编辑、分享与读取")
@RestController
@RequestMapping("/api/v1/dashboard/custom")
@RequiredArgsConstructor
public class CustomDashboardController {

    private final CustomDashboardService customDashboardService;

    @GetMapping
    @RequiresPermission("dashboard:read")
    @Operation(summary = "自定义看板列表")
    public R<List<CustomDashboardVO>> list() {
        return R.ok(customDashboardService.list());
    }

    @PostMapping
    @RequiresPermission("dashboard:manage")
    @Operation(summary = "创建自定义看板")
    public R<CustomDashboardVO> create(@Valid @RequestBody CustomDashboardSaveDTO dto) {
        return R.ok(customDashboardService.create(dto));
    }

    @GetMapping("/{slug}")
    @RequiresPermission("dashboard:read")
    @Operation(summary = "读取自定义看板")
    public R<CustomDashboardVO> get(@Parameter(description = "看板 slug", required = true) @PathVariable String slug) {
        return R.ok(customDashboardService.get(slug));
    }

    @PutMapping("/{slug}")
    @RequiresPermission("dashboard:manage")
    @Operation(summary = "更新自定义看板")
    public R<CustomDashboardVO> update(@Parameter(description = "看板 slug", required = true) @PathVariable String slug,
                                       @Valid @RequestBody CustomDashboardSaveDTO dto) {
        return R.ok(customDashboardService.update(slug, dto));
    }

    @DeleteMapping("/{slug}")
    @RequiresPermission("dashboard:manage")
    @Operation(summary = "删除自定义看板")
    public R<Void> delete(@Parameter(description = "看板 slug", required = true) @PathVariable String slug) {
        customDashboardService.delete(slug);
        return R.ok();
    }

    @PostMapping("/{slug}/share")
    @RequiresPermission("dashboard:manage")
    @Operation(summary = "开启/关闭分享")
    public R<CustomDashboardVO> setShare(@Parameter(description = "看板 slug", required = true) @PathVariable String slug,
                                         @Parameter(description = "是否开启分享", required = true) @RequestParam boolean enabled) {
        return R.ok(customDashboardService.setShare(slug, enabled));
    }

    @GetMapping("/share/{token}")
    @RequiresPermission("dashboard:read")
    @Operation(summary = "按分享令牌读取看板")
    public R<CustomDashboardVO> getByShareToken(@Parameter(description = "分享令牌", required = true) @PathVariable String token) {
        return R.ok(customDashboardService.getByShareToken(token));
    }
}
