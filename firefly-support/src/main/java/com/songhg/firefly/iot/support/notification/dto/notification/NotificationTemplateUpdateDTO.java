package com.songhg.firefly.iot.support.notification.dto.notification;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Notification template update request.
 */
@Data
@Schema(description = "通知模板更新请求")
public class NotificationTemplateUpdateDTO {

    @Schema(description = "模板名称")
    @NotBlank(message = "模板名称不能为空")
    private String name;

    @Schema(description = "通道")
    private String channel;

    @Schema(description = "主题")
    private String subject;

    @Schema(description = "内容")
    private String content;

    @Schema(description = "变量")
    private String variables;

    @Schema(description = "是否启用")
    private Boolean enabled;
}
