package com.songhg.firefly.iot.support.dto.scheduledtask;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Scheduled task creation request.
 */
@Data
@Schema(description = "定时任务创建请求")
public class ScheduledTaskCreateDTO {

    @Schema(description = "任务名称")
    @NotBlank(message = "任务名称不能为空")
    @Size(max = 200)
    private String taskName;

    @Schema(description = "任务分组")
    private String taskGroup;

    @Schema(description = "定时表达式", example = "0 0/5 * * * ?")
    @NotBlank(message = "Cron 表达式不能为空")
    @Size(max = 100)
    private String cronExpression;

    @Schema(description = "任务组件名称")
    @NotBlank(message = "Bean 名称不能为空")
    @Size(max = 200)
    private String beanName;

    @Schema(description = "方法名称")
    @NotBlank(message = "方法名不能为空")
    @Size(max = 200)
    private String methodName;

    @Schema(description = "方法参数")
    @Size(max = 500)
    private String methodParams;

    @Schema(description = "状态（0禁用，1启用）")
    private Integer status;

    @Schema(description = "描述")
    @Size(max = 500)
    private String description;

    @Schema(description = "错过执行策略")
    private Integer misfirePolicy;
}
