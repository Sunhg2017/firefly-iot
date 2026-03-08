package com.songhg.firefly.iot.rule.dto.ruleengine;

import com.songhg.firefly.iot.common.enums.RuleActionType;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Rule action definition.
 */
@Data
@Schema(description = "规则动作定义")
public class RuleActionDTO {

    @Schema(description = "动作编号")
    private Long id;

    @Schema(description = "动作类型")
    @NotNull(message = "动作类型不能为空")
    private RuleActionType actionType;

    @Schema(description = "动作配置")
    private String actionConfig;

    @Schema(description = "排序")
    private Integer sortOrder;

    @Schema(description = "是否启用")
    private Boolean enabled;
}
