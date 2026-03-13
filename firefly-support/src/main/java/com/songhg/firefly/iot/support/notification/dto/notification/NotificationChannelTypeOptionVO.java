package com.songhg.firefly.iot.support.notification.dto.notification;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * Available notification method option for business modules.
 */
@Data
@Schema(description = "Available notification channel type option")
public class NotificationChannelTypeOptionVO {

    @Schema(description = "Channel type", example = "EMAIL")
    private String type;

    @Schema(description = "Display label", example = "邮件")
    private String label;

    @Schema(description = "Available channel count", example = "2")
    private Integer channelCount;
}
