package com.songhg.firefly.iot.support.dto.scheduledtask;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Scheduled task view object.
 */
@Data
@Schema(description = "Scheduled task view object")
public class ScheduledTaskVO {

    @Schema(description = "Task ID")
    private Long id;

    @Schema(description = "Task name")
    private String taskName;

    @Schema(description = "Task group")
    private String taskGroup;

    @Schema(description = "Cron expression")
    private String cronExpression;

    @Schema(description = "Spring bean name")
    private String beanName;

    @Schema(description = "Method name")
    private String methodName;

    @Schema(description = "Method parameters")
    private String methodParams;

    @Schema(description = "Status (0=disabled, 1=enabled)")
    private Integer status;

    @Schema(description = "Description")
    private String description;

    @Schema(description = "Misfire policy")
    private Integer misfirePolicy;

    @Schema(description = "Last execution time")
    private LocalDateTime lastExecTime;

    @Schema(description = "Last execution status")
    private String lastExecStatus;

    @Schema(description = "Last execution message")
    private String lastExecMessage;

    @Schema(description = "Creator user ID")
    private Long createdBy;

    @Schema(description = "Creation time")
    private LocalDateTime createdAt;

    @Schema(description = "Last update time")
    private LocalDateTime updatedAt;
}
