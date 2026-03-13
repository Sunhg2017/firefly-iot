package com.songhg.firefly.iot.rule.dto.ruleengine;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * Rule engine update request.
 */
@Data
@Schema(description = "规则引擎更新请求")
public class RuleEngineUpdateDTO {

    @Schema(description = "规则名称")
    @Size(max = 256)
    private String name;

    @Schema(description = "描述")
    private String description;

    @Schema(description = "项目编号")
    private Long projectId;

    @Schema(description = "规则表达式")
    private String sqlExpr;

    @Schema(description = "规则动作")
    @Valid
    private List<RuleActionDTO> actions;
}
