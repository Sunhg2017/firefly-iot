package com.songhg.firefly.iot.support.notification.dto.messagetemplate;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Message template view object.
 */
@Data
@Schema(description = "Message template view object")
public class MessageTemplateVO {

    @Schema(description = "Template ID")
    private Long id;

    @Schema(description = "Template code")
    private String code;

    @Schema(description = "Template name")
    private String name;

    @Schema(description = "Channel")
    private String channel;

    @Schema(description = "Template type")
    private String templateType;

    @Schema(description = "Subject")
    private String subject;

    @Schema(description = "Content")
    private String content;

    @Schema(description = "Variables (JSON)")
    private String variables;

    @Schema(description = "Enabled flag")
    private Boolean enabled;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Creator user ID")
    private Long createdBy;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;

    @Schema(description = "Last update time")
    private LocalDateTime updatedAt;
}
