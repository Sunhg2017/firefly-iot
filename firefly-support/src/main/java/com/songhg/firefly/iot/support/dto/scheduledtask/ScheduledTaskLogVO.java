package com.songhg.firefly.iot.support.dto.scheduledtask;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Scheduled task log view object.
 */
@Data
@Schema(description = "Scheduled task log view object")
public class ScheduledTaskLogVO {

    @Schema(description = "Log ID")
    private Long id;

    @Schema(description = "Task ID")
    private Long taskId;

    @Schema(description = "Task name")
    private String taskName;

    @Schema(description = "Task group")
    private String taskGroup;

    @Schema(description = "Spring bean name")
    private String beanName;

    @Schema(description = "Method name")
    private String methodName;

    @Schema(description = "Method parameters")
    private String methodParams;

    @Schema(description = "Execution status")
    private String status;

    @Schema(description = "Start time")
    private LocalDateTime startTime;

    @Schema(description = "End time")
    private LocalDateTime endTime;

    @Schema(description = "Duration in milliseconds")
    private Long durationMs;

    @Schema(description = "Error message")
    private String errorMessage;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;
}
