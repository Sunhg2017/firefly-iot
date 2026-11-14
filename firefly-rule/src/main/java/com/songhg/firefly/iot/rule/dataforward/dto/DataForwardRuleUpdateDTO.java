package com.songhg.firefly.iot.rule.dataforward.dto;

import com.songhg.firefly.iot.common.enums.DataForwardTargetType;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
@Schema(description = "数据流转规则更新请求")
public class DataForwardRuleUpdateDTO {

    @Schema(description = "规则名称")
    @Size(max = 256)
    private String name;

    @Schema(description = "描述")
    private String description;

    @Schema(description = "项目编号")
    private Long projectId;

    @Schema(description = "消息源匹配（消息类型名或 Topic 通配）")
    @Size(max = 256)
    private String sourcePattern;

    @Schema(description = "过滤条件（SpEL）")
    private String matchCondition;

    @Schema(description = "转发目标类型")
    private DataForwardTargetType targetType;

    @Schema(description = "目标配置（JSON）")
    private String targetConfig;
}
