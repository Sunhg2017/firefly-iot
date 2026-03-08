package com.songhg.firefly.iot.support.dto.asynctask;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Async task view object.
 */
@Data
@Schema(description = "Async task view object")
public class AsyncTaskVO {

    @Schema(description = "Task ID")
    private Long id;

    @Schema(description = "Task name")
    private String taskName;

    @Schema(description = "Task type")
    private String taskType;

    @Schema(description = "Business type")
    private String bizType;

    @Schema(description = "File format")
    private String fileFormat;

    @Schema(description = "Status")
    private String status;

    @Schema(description = "Progress (0-100)")
    private Integer progress;

    @Schema(description = "Query parameters (JSON)")
    private String queryParams;

    @Schema(description = "Result file URL")
    private String resultUrl;

    @Schema(description = "Result file size in bytes")
    private Long resultSize;

    @Schema(description = "Total rows")
    private Integer totalRows;

    @Schema(description = "Error message")
    private String errorMessage;

    @Schema(description = "Creator user ID")
    private Long createdBy;

    @Schema(description = "Completion time")
    private LocalDateTime completedAt;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;

    @Schema(description = "Last update time")
    private LocalDateTime updatedAt;
}
