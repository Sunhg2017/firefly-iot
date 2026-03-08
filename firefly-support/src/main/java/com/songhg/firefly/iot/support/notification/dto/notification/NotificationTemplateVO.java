package com.songhg.firefly.iot.support.notification.dto.notification;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Notification template view object.
 */
@Data
@Schema(description = "Notification template view object")
public class NotificationTemplateVO {

    @Schema(description = "Template ID")
    private Long id;

    @Schema(description = "Template code")
    private String code;

    @Schema(description = "Template name")
    private String name;

    @Schema(description = "Channel")
    private String channel;

    @Schema(description = "Subject")
    private String subject;

    @Schema(description = "Content")
    private String content;

    @Schema(description = "Variables (JSON)")
    private String variables;

    @Schema(description = "Enabled flag")
    private Boolean enabled;

    @Schema(description = "Last update time")
    private LocalDateTime updatedAt;
}
