package com.songhg.firefly.iot.support.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.base.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "scheduled_task_logs", excludeProperty = {"updatedAt"})
public class ScheduledTaskLog extends BaseEntity {

    private Long taskId;
    private String taskName;
    private String taskGroup;
    private String beanName;
    private String methodName;
    private String methodParams;
    private String status;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private Long durationMs;
    private String errorMessage;
}
