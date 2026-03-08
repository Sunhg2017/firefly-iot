package com.songhg.firefly.iot.support.notification.dto.notification;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Notification channel creation request.
 */
@Data
@Schema(description = "通知渠道创建请求")
public class NotificationChannelCreateDTO {

    @Schema(description = "渠道名称")
    @NotBlank(message = "渠道名称不能为空")
    private String name;

    @Schema(description = "渠道类型")
    @NotBlank(message = "渠道类型不能为空")
    private String type;

    @Schema(description = "渠道配置")
    private String config;

    @Schema(description = "是否启用")
    private Boolean enabled = true;
}
