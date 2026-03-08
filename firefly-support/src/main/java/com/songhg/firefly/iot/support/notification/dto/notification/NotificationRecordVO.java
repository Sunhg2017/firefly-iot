package com.songhg.firefly.iot.support.notification.dto.notification;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Notification record view object.
 */
@Data
@Schema(description = "Notification record view object")
public class NotificationRecordVO {

    @Schema(description = "Record ID")
    private Long id;

    @Schema(description = "Channel ID")
    private Long channelId;

    @Schema(description = "Channel type")
    private String channelType;

    @Schema(description = "Template code")
    private String templateCode;

    @Schema(description = "Subject")
    private String subject;

    @Schema(description = "Content")
    private String content;

    @Schema(description = "Recipient")
    private String recipient;

    @Schema(description = "Status")
    private String status;

    @Schema(description = "Error message")
    private String errorMessage;

    @Schema(description = "Retry count")
    private Integer retryCount;

    @Schema(description = "Sent time")
    private LocalDateTime sentAt;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;
}
