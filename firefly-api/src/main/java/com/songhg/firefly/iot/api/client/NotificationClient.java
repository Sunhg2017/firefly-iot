package com.songhg.firefly.iot.api.client;

import com.songhg.firefly.iot.api.dto.NotificationRequestDTO;
import com.songhg.firefly.iot.common.result.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

/**
 * 通知服务 Feign Client（供其他微服务调用 firefly-support 发送通知）
 */
@FeignClient(name = "firefly-support", contextId = "notificationClient", path = "/api/v1/internal/notifications")
public interface NotificationClient {

    @PostMapping("/send")
    R<Void> send(@RequestBody NotificationRequestDTO request);
}
