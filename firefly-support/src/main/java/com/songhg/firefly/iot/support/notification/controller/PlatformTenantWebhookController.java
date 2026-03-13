package com.songhg.firefly.iot.support.notification.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.support.notification.dto.notification.NotificationChannelCreateDTO;
import com.songhg.firefly.iot.support.notification.dto.notification.NotificationChannelVO;
import com.songhg.firefly.iot.support.notification.service.NotificationChannelService;
import com.songhg.firefly.iot.support.notification.service.NotificationSender;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Tenant Webhook Management", description = "系统运维按租户维护 Webhook 渠道")
@RestController
@RequestMapping("/api/v1/platform/tenants/{tenantId}/webhook-channels")
@RequiredArgsConstructor
public class PlatformTenantWebhookController {

    private final NotificationChannelService channelService;
    private final NotificationSender notificationSender;

    @GetMapping
    @RequiresPermission("notification:read")
    @Operation(summary = "查询租户 Webhook 列表")
    public R<List<NotificationChannelVO>> listChannels(
            @Parameter(description = "租户编号", required = true) @PathVariable Long tenantId) {
        return R.ok(channelService.listTenantWebhookChannels(tenantId));
    }

    @PostMapping
    @RequiresPermission("notification:update")
    @Operation(summary = "创建租户 Webhook")
    public R<NotificationChannelVO> createChannel(
            @Parameter(description = "租户编号", required = true) @PathVariable Long tenantId,
            @Valid @RequestBody NotificationChannelCreateDTO dto) {
        return R.ok(channelService.createTenantWebhookChannel(tenantId, dto));
    }

    @PutMapping("/{id}")
    @RequiresPermission("notification:update")
    @Operation(summary = "更新租户 Webhook")
    public R<NotificationChannelVO> updateChannel(
            @Parameter(description = "租户编号", required = true) @PathVariable Long tenantId,
            @Parameter(description = "渠道编号", required = true) @PathVariable Long id,
            @Valid @RequestBody NotificationChannelCreateDTO dto) {
        return R.ok(channelService.updateTenantWebhookChannel(tenantId, id, dto));
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("notification:delete")
    @Operation(summary = "删除租户 Webhook")
    public R<Void> deleteChannel(
            @Parameter(description = "租户编号", required = true) @PathVariable Long tenantId,
            @Parameter(description = "渠道编号", required = true) @PathVariable Long id) {
        channelService.deleteTenantWebhookChannel(tenantId, id);
        return R.ok();
    }

    @PutMapping("/{id}/toggle")
    @RequiresPermission("notification:update")
    @Operation(summary = "启用/禁用租户 Webhook")
    public R<Void> toggleChannel(
            @Parameter(description = "租户编号", required = true) @PathVariable Long tenantId,
            @Parameter(description = "渠道编号", required = true) @PathVariable Long id,
            @Parameter(description = "启用或禁用") @RequestParam boolean enabled) {
        channelService.toggleTenantWebhookChannel(tenantId, id, enabled);
        return R.ok();
    }

    @PostMapping("/{id}/test")
    @RequiresPermission("notification:update")
    @Operation(summary = "测试租户 Webhook")
    public R<String> testChannel(
            @Parameter(description = "租户编号", required = true) @PathVariable Long tenantId,
            @Parameter(description = "渠道编号", required = true) @PathVariable Long id) {
        return R.ok(notificationSender.testTenantWebhookChannel(tenantId, id));
    }
}
