package com.songhg.firefly.iot.support.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.base.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("scheduled_tasks")
public class ScheduledTask extends BaseEntity {

    private String taskName;
    private String taskGroup;
    private String cronExpression;
    private String beanName;
    private String methodName;
    private String methodParams;
    private Integer status;
    private String description;
    private Integer misfirePolicy;
    private LocalDateTime lastExecTime;
    private String lastExecStatus;
    private String lastExecMessage;
    private Long createdBy;
}
