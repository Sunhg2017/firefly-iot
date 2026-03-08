package com.songhg.firefly.iot.support.dto.scheduledtask;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 定时任务分页查询请求
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "定时任务分页查询请求")
public class ScheduledTaskQueryDTO extends PageQuery {

    @Schema(description = "任务分组筛选")
    private String taskGroup;

    @Schema(description = "任务状态筛选")
    private Integer status;
}
