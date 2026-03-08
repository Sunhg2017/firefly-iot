package com.songhg.firefly.iot.rule.dto.share;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 共享审计日志分页查询请求
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "共享审计日志分页查询请求")
public class ShareAuditLogQueryDTO extends PageQuery {

    @Schema(description = "策略编号筛选")
    private Long policyId;
}
