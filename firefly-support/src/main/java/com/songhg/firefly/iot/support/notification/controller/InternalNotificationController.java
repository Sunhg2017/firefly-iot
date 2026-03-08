package com.songhg.firefly.iot.support.notification.controller;

import com.songhg.firefly.iot.api.dto.NotificationRequestDTO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.support.notification.service.NotificationSender;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 内部 Feign 调用端点：供其他微服务发送通知
 */
@Tag(name = "内部通知接口", description = "供 Feign 调用的通知发送端点")
@RestController
@RequestMapping("/api/v1/internal/notifications")
@RequiredArgsConstructor
public class InternalNotificationController {

    private final NotificationSender notificationSender;

    @PostMapping("/send")
    @Operation(summary = "发送通知（内部调用）")
    public R<Void> send(@RequestBody NotificationRequestDTO request) {
        notificationSender.send(
                request.getChannelId(),
                request.getTemplateCode(),
                request.getRecipient(),
                request.getVariables()
        );
        return R.ok();
    }
}
