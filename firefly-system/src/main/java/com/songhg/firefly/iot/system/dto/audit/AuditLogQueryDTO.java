package com.songhg.firefly.iot.system.dto.audit;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.AuditAction;
import com.songhg.firefly.iot.common.enums.AuditModule;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * 审计日志查询请求
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "审计日志分页查询请求")
public class AuditLogQueryDTO extends PageQuery {

    @Schema(description = "搜索关键字")
    private String keyword;

    @Schema(description = "审计模块筛选")
    private AuditModule module;

    @Schema(description = "审计动作筛选")
    private AuditAction action;

    @Schema(description = "用户ID筛选")
    private Long userId;

    @Schema(description = "响应状态筛选")
    private String responseStatus;

    @Schema(description = "开始时间")
    private LocalDateTime startTime;

    @Schema(description = "结束时间")
    private LocalDateTime endTime;
}
