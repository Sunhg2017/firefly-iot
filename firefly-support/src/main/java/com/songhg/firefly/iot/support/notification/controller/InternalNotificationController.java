package com.songhg.firefly.iot.support.notification.controller;

import com.songhg.firefly.iot.api.dto.NotificationRequestDTO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.support.notification.service.NotificationSender;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "内部通知接口", description = "供其他微服务调用的通知发送接口")
@RestController
@RequestMapping("/api/v1/internal/notifications")
@RequiredArgsConstructor
public class InternalNotificationController {

    private final NotificationSender notificationSender;

    @PostMapping("/send")
    @Operation(summary = "发送通知（内部调用）")
    public R<Void> send(@RequestBody NotificationRequestDTO request) {
        if (request.getTenantId() == null) {
            return R.fail(ResultCode.PARAM_ERROR, "tenantId is required");
        }
        if (request.getChannelId() == null) {
            return R.fail(ResultCode.PARAM_ERROR, "channelId is required");
        }
        if (request.getTemplateCode() == null || request.getTemplateCode().isBlank()) {
            return R.fail(ResultCode.PARAM_ERROR, "templateCode is required");
        }

        notificationSender.sendForTenant(
                request.getTenantId(),
                null,
                request.getChannelId(),
                request.getTemplateCode(),
                request.getRecipient(),
                request.getVariables()
        );
        return R.ok();
    }
}
