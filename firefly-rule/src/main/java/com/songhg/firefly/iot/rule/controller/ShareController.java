package com.songhg.firefly.iot.rule.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.rule.dto.share.ShareAuditLogVO;
import com.songhg.firefly.iot.rule.dto.share.ShareAuditLogQueryDTO;
import com.songhg.firefly.iot.rule.dto.share.SharePolicyCreateDTO;
import com.songhg.firefly.iot.rule.dto.share.SharePolicyVO;
import com.songhg.firefly.iot.rule.service.SharePolicyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "跨租户共享", description = "共享策略与订阅管理")
@RestController
@RequestMapping("/api/v1/share-policies")
@RequiredArgsConstructor
public class ShareController {

    private final SharePolicyService sharePolicyService;

    @Operation(summary = "查询我发布的共享策略")
    @GetMapping("/owned")
    @RequiresPermission("share:read")
    public R<List<SharePolicyVO>> listOwned() {
        return R.ok(sharePolicyService.listOwned());
    }

    @Operation(summary = "查询我订阅的共享策略")
    @GetMapping("/consumed")
    @RequiresPermission("share:read")
    public R<List<SharePolicyVO>> listConsumed() {
        return R.ok(sharePolicyService.listConsumed());
    }

    @Operation(summary = "获取共享策略详情")
    @GetMapping("/{id}")
    @RequiresPermission("share:read")
    public R<SharePolicyVO> getById(@Parameter(description = "策略编号", required = true) @PathVariable Long id) {
        return R.ok(sharePolicyService.getById(id));
    }

    @Operation(summary = "创建共享策略")
    @PostMapping
    @RequiresPermission("share:create")
    public R<SharePolicyVO> create(@Valid @RequestBody SharePolicyCreateDTO dto) {
        return R.ok(sharePolicyService.create(dto));
    }

    @Operation(summary = "更新共享策略")
    @PutMapping("/{id}")
    @RequiresPermission("share:update")
    public R<SharePolicyVO> update(@Parameter(description = "策略编号", required = true) @PathVariable Long id, @Valid @RequestBody SharePolicyCreateDTO dto) {
        return R.ok(sharePolicyService.update(id, dto));
    }

    @Operation(summary = "删除共享策略")
    @DeleteMapping("/{id}")
    @RequiresPermission("share:delete")
    public R<Void> delete(@Parameter(description = "策略编号", required = true) @PathVariable Long id) {
        sharePolicyService.delete(id);
        return R.ok();
    }

    @Operation(summary = "审批通过共享策略")
    @PostMapping("/{id}/approve")
    @RequiresPermission("share:approve")
    public R<SharePolicyVO> approve(@Parameter(description = "策略编号", required = true) @PathVariable Long id) {
        return R.ok(sharePolicyService.approve(id));
    }

    @Operation(summary = "拒绝共享策略")
    @PostMapping("/{id}/reject")
    @RequiresPermission("share:approve")
    public R<SharePolicyVO> reject(@Parameter(description = "策略编号", required = true) @PathVariable Long id) {
        return R.ok(sharePolicyService.reject(id));
    }

    @Operation(summary = "撤销共享策略")
    @PostMapping("/{id}/revoke")
    @RequiresPermission("share:revoke")
    public R<SharePolicyVO> revoke(@Parameter(description = "策略编号", required = true) @PathVariable Long id) {
        return R.ok(sharePolicyService.revoke(id));
    }

    @PostMapping("/audit-logs/list")
    @RequiresPermission("share:read")
    @Operation(summary = "查询共享审计日志")
    public R<IPage<ShareAuditLogVO>> listAuditLogs(@RequestBody ShareAuditLogQueryDTO query) {
        return R.ok(sharePolicyService.listAuditLogs(query));
    }
}
