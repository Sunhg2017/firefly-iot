package com.songhg.firefly.iot.support.notification.dto.notification;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Notification channel view object.
 */
@Data
@Schema(description = "Notification channel view object")
public class NotificationChannelVO {

    @Schema(description = "Channel ID")
    private Long id;

    @Schema(description = "Channel name")
    private String name;

    @Schema(description = "Channel type")
    private String type;

    @Schema(description = "Channel config (JSON)")
    private String config;

    @Schema(description = "Enabled flag")
    private Boolean enabled;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;

    @Schema(description = "Last update time")
    private LocalDateTime updatedAt;
}
