package com.songhg.firefly.iot.support.dto.message;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * In-app message view object.
 */
@Data
@Schema(description = "In-app message view object")
public class InAppMessageVO {

    @Schema(description = "Message ID")
    private Long id;

    @Schema(description = "User ID")
    private Long userId;

    @Schema(description = "Title")
    private String title;

    @Schema(description = "Content")
    private String content;

    @Schema(description = "Message type")
    private String type;

    @Schema(description = "Level")
    private String level;

    @Schema(description = "Read flag")
    private Boolean isRead;

    @Schema(description = "Read time")
    private LocalDateTime readAt;

    @Schema(description = "Source")
    private String source;

    @Schema(description = "Source ID")
    private String sourceId;

    @Schema(description = "Creator user ID")
    private Long createdBy;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;
}
