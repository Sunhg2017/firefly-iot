package com.songhg.firefly.iot.support.notification.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.support.notification.dto.notification.*;
import com.songhg.firefly.iot.support.notification.service.NotificationChannelService;
import com.songhg.firefly.iot.support.notification.service.NotificationRecordService;
import com.songhg.firefly.iot.support.notification.service.NotificationSender;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "通知中心", description = "通知渠道与通知记录")
@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationChannelService channelService;
    private final NotificationRecordService recordService;
    private final NotificationSender notificationSender;
    // ==================== Channels ====================

    @GetMapping("/channels")
    @RequiresPermission("notification:read")
    @Operation(summary = "查询通知渠道列表")
    public R<List<NotificationChannelVO>> listChannels() {
        return R.ok(channelService.listAll());
    }

    @GetMapping("/channels/{id}")
    @RequiresPermission("notification:read")
    @Operation(summary = "获取通知渠道详情")
    public R<NotificationChannelVO> getChannel(@Parameter(description = "渠道编号", required = true) @PathVariable Long id) {
        return R.ok(channelService.getById(id));
    }

    @PostMapping("/channels")
    @RequiresPermission("notification:update")
    @Operation(summary = "创建通知渠道")
    public R<NotificationChannelVO> createChannel(@Valid @RequestBody NotificationChannelCreateDTO dto) {
        return R.ok(channelService.create(dto));
    }

    @PutMapping("/channels/{id}")
    @RequiresPermission("notification:update")
    @Operation(summary = "更新通知渠道")
    public R<NotificationChannelVO> updateChannel(@Parameter(description = "渠道编号", required = true) @PathVariable Long id, @Valid @RequestBody NotificationChannelCreateDTO dto) {
        return R.ok(channelService.update(id, dto));
    }

    @DeleteMapping("/channels/{id}")
    @RequiresPermission("notification:delete")
    @Operation(summary = "删除通知渠道")
    public R<Void> deleteChannel(@Parameter(description = "渠道编号", required = true) @PathVariable Long id) {
        channelService.delete(id);
        return R.ok();
    }

    @Operation(summary = "启用/禁用通知渠道")
    @PutMapping("/channels/{id}/toggle")
    @RequiresPermission("notification:update")
    public R<Void> toggleChannel(@Parameter(description = "渠道编号", required = true) @PathVariable Long id, @Parameter(description = "启用或禁用") @RequestParam boolean enabled) {
        channelService.toggleEnabled(id, enabled);
        return R.ok();
    }

    @PostMapping("/channels/{id}/test")
    @RequiresPermission("notification:update")
    @Operation(summary = "测试通知渠道")
    public R<String> testChannel(@Parameter(description = "渠道编号", required = true) @PathVariable Long id) {
        return R.ok(notificationSender.testChannel(id));
    }

    // ==================== Records ====================

    @PostMapping("/records/list")
    @RequiresPermission("notification:read")
    @Operation(summary = "查询通知记录列表")
    public R<IPage<NotificationRecordVO>> listRecords(@RequestBody NotificationRecordQueryDTO query) {
        return R.ok(recordService.listRecords(query));
    }

    @GetMapping("/records/{id}")
    @RequiresPermission("notification:read")
    @Operation(summary = "获取通知记录详情")
    public R<NotificationRecordVO> getRecord(@Parameter(description = "记录编号", required = true) @PathVariable Long id) {
        return R.ok(recordService.getById(id));
    }
}
