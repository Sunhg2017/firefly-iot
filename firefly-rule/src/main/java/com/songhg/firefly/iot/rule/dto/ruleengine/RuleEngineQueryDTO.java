package com.songhg.firefly.iot.rule.dto.ruleengine;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.RuleEngineStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Rule engine paginated query.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "规则引擎分页查询")
public class RuleEngineQueryDTO extends PageQuery {

    @Schema(description = "关键词")
    private String keyword;

    @Schema(description = "状态筛选")
    private RuleEngineStatus status;

    @Schema(description = "项目编号筛选")
    private Long projectId;
}
