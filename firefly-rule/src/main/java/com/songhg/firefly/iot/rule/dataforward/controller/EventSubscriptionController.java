package com.songhg.firefly.iot.rule.dataforward.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.rule.dataforward.dto.EventSubscriptionCreateDTO;
import com.songhg.firefly.iot.rule.dataforward.dto.EventSubscriptionQueryDTO;
import com.songhg.firefly.iot.rule.dataforward.dto.EventSubscriptionUpdateDTO;
import com.songhg.firefly.iot.rule.dataforward.dto.EventSubscriptionVO;
import com.songhg.firefly.iot.rule.dataforward.service.EventSubscriptionService;
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

@Tag(name = "事件订阅", description = "平台事件 Webhook 订阅 CRUD、启停")
@RestController
@RequestMapping("/api/v1/event-subscriptions")
@RequiredArgsConstructor
public class EventSubscriptionController {

    private final EventSubscriptionService subscriptionService;

    @PostMapping
    @RequiresPermission("event-subscription:create")
    @Operation(summary = "创建事件订阅")
    public R<EventSubscriptionVO> create(@Valid @RequestBody EventSubscriptionCreateDTO dto) {
        return R.ok(subscriptionService.create(dto));
    }

    @PostMapping("/list")
    @RequiresPermission("event-subscription:read")
    @Operation(summary = "分页查询事件订阅")
    public R<IPage<EventSubscriptionVO>> list(@RequestBody EventSubscriptionQueryDTO query) {
        return R.ok(subscriptionService.list(query));
    }

    @GetMapping("/{id}")
    @RequiresPermission("event-subscription:read")
    @Operation(summary = "获取事件订阅详情")
    public R<EventSubscriptionVO> get(@Parameter(description = "订阅编号", required = true) @PathVariable Long id) {
        return R.ok(subscriptionService.getById(id));
    }

    @PutMapping("/{id}")
    @RequiresPermission("event-subscription:update")
    @Operation(summary = "更新事件订阅")
    public R<EventSubscriptionVO> update(@Parameter(description = "订阅编号", required = true) @PathVariable Long id,
                                         @Valid @RequestBody EventSubscriptionUpdateDTO dto) {
        return R.ok(subscriptionService.update(id, dto));
    }

    @PutMapping("/{id}/enable")
    @RequiresPermission("event-subscription:update")
    @Operation(summary = "启用事件订阅")
    public R<Void> enable(@Parameter(description = "订阅编号", required = true) @PathVariable Long id) {
        subscriptionService.enable(id);
        return R.ok();
    }

    @PutMapping("/{id}/disable")
    @RequiresPermission("event-subscription:update")
    @Operation(summary = "停用事件订阅")
    public R<Void> disable(@Parameter(description = "订阅编号", required = true) @PathVariable Long id) {
        subscriptionService.disable(id);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("event-subscription:delete")
    @Operation(summary = "删除事件订阅")
    public R<Void> delete(@Parameter(description = "订阅编号", required = true) @PathVariable Long id) {
        subscriptionService.delete(id);
        return R.ok();
    }
}
