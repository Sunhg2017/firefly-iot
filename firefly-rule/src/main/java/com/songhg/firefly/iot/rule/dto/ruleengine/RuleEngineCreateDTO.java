package com.songhg.firefly.iot.rule.dto.ruleengine;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * Rule engine creation request.
 */
@Data
@Schema(description = "规则引擎创建请求")
public class RuleEngineCreateDTO {

    @Schema(description = "规则名称")
    @NotBlank(message = "规则名称不能为空")
    @Size(max = 256)
    private String name;

    @Schema(description = "描述")
    private String description;

    @Schema(description = "项目编号")
    private Long projectId;

    @Schema(description = "规则表达式")
    @NotBlank(message = "SQL表达式不能为空")
    private String sqlExpr;

    @Schema(description = "规则动作")
    private List<RuleActionDTO> actions;
}
