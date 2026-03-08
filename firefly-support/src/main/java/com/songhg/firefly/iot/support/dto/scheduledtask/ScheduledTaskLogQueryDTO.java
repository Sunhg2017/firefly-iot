package com.songhg.firefly.iot.support.dto.scheduledtask;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 定时任务执行日志分页查询请求
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "定时任务执行日志分页查询请求")
public class ScheduledTaskLogQueryDTO extends PageQuery {

    @Schema(description = "任务编号筛选")
    private Long taskId;

    @Schema(description = "执行状态筛选")
    private String status;
}
