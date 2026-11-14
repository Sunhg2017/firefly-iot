package com.songhg.firefly.iot.rule.dataforward.dto;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.DataForwardTargetType;
import com.songhg.firefly.iot.common.enums.ForwardStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "数据流转规则分页查询")
public class DataForwardRuleQueryDTO extends PageQuery {

    @Schema(description = "关键词")
    private String keyword;

    @Schema(description = "状态筛选")
    private ForwardStatus status;

    @Schema(description = "转发目标类型筛选")
    private DataForwardTargetType targetType;

    @Schema(description = "项目编号筛选")
    private Long projectId;
}
