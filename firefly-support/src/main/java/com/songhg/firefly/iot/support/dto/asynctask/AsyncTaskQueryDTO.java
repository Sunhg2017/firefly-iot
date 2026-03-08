package com.songhg.firefly.iot.support.dto.asynctask;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 异步任务分页查询请求
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "异步任务分页查询请求")
public class AsyncTaskQueryDTO extends PageQuery {

    @Schema(description = "任务类型筛选")
    private String taskType;

    @Schema(description = "任务状态筛选")
    private String status;
}
