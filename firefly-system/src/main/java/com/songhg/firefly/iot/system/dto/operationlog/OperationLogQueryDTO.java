package com.songhg.firefly.iot.system.dto.operationlog;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * 操作日志分页查询请求
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "操作日志分页查询请求")
public class OperationLogQueryDTO extends PageQuery {

    @Schema(description = "模块筛选")
    private String module;

    @Schema(description = "操作类型筛选")
    private String operationType;

    @Schema(description = "用户名筛选")
    private String username;

    @Schema(description = "状态筛选（0=成功，1=失败）")
    private Integer status;

    @Schema(description = "开始时间")
    private LocalDateTime start;

    @Schema(description = "结束时间")
    private LocalDateTime end;
}
